/* global fetch */

import url from 'url';

import utf8 from 'utf8';
import 'isomorphic-fetch';
import { schema as normalizrSchema, normalize } from 'normalizr';
import { oneLine } from 'common-tags';
import config from 'config';

import { ADDON_TYPE_THEME } from 'core/constants';
import log from 'core/logger';
import { convertFiltersToQueryParams } from 'core/searchUtils';


const API_BASE = `${config.get('apiHost')}${config.get('apiPath')}`;
const Entity = normalizrSchema.Entity;

export const addon = new Entity('addons', {}, { idAttribute: 'slug' });
export const category = new Entity('categories', {}, { idAttribute: 'slug' });
export const user = new Entity('users', {}, { idAttribute: 'username' });

export function makeQueryString(query) {
  const resolvedQuery = { ...query };
  Object.keys(resolvedQuery).forEach((key) => {
    const value = resolvedQuery[key];
    if (value === undefined || value === null || value === '') {
      // Make sure we don't turn this into ?key= (empty string) because
      // sending an empty string to the API sometimes triggers bugs.
      delete resolvedQuery[key];
    }
  });
  return url.format({ query: resolvedQuery });
}

export function createApiError({ apiURL, response, jsonResponse }) {
  let urlId = '[unknown URL]';
  if (apiURL) {
    // Strip the host since we already know that.
    urlId = apiURL.replace(config.get('apiHost'), '');
    // Strip query string params since lang will vary quite a lot.
    urlId = urlId.split('?')[0];
  }
  const apiError = new Error(`Error calling: ${urlId}`);
  apiError.response = {
    apiURL,
    status: response.status,
    data: jsonResponse,
  };
  return apiError;
}

export function callApi({
  endpoint, schema, params = {}, auth = false, state = {}, method = 'get',
  body, credentials, errorHandler,
}) {
  if (errorHandler) {
    errorHandler.clear();
  }
  const queryString = makeQueryString({ ...params, lang: state.lang });
  const options = {
    headers: {},
    // Always make sure the method is upper case so that the browser won't
    // complain about CORS problems.
    method: method.toUpperCase(),
  };
  if (credentials) {
    options.credentials = 'include';
  }
  if (body) {
    options.body = JSON.stringify(body);
    options.headers['Content-type'] = 'application/json';
  }
  if (auth) {
    if (state.token) {
      options.headers.authorization = `Bearer ${state.token}`;
    }
  }
  // Workaround for https://github.com/bitinn/node-fetch/issues/245
  const apiURL = utf8.encode(`${API_BASE}/${endpoint}/${queryString}`);

  return fetch(apiURL, options)
    .then((response) => {
      const contentType = response.headers.get('Content-Type').toLowerCase();

      // This is a bit paranoid, but we ensure the API returns a JSON response
      // (see https://github.com/mozilla/addons-frontend/issues/1701).
      // If not we'll store the text response in JSON and log an error.
      // If the JSON parsing fails; we log the error and return an "unknown
      // error".
      if (contentType === 'application/json') {
        return response.json()
          .then((jsonResponse) => ({ response, jsonResponse }));
      }

      log.warn(oneLine`Response from API was not JSON (was Content-Type:
        ${contentType})`, response);
      return response.text().then((textResponse) => {
        return { jsonResponse: { text: textResponse }, response };
      });
    })
    .then(({ response, jsonResponse }) => {
      if (response.ok) {
        return jsonResponse;
      }

      // If response is not ok we'll throw an error.
      // Note that if callApi is executed by an asyncConnect() handler,
      // then redux-connect will catch this exception and
      // dispatch a LOAD_FAIL action which puts the error in the state.
      const apiError = createApiError({ apiURL, response, jsonResponse });
      if (errorHandler) {
        errorHandler.handle(apiError);
      }
      throw apiError;
    }, (fetchError) => {
      // This actually handles the case when the call to fetch() is
      // rejected, say, for a network connection error, etc.
      if (errorHandler) {
        errorHandler.handle(fetchError);
      }
      throw fetchError;
    })
    .then((response) => (schema ? normalize(response, schema) : response));
}

export function search({ api, page, auth = false, filters = {} }) {
  const _filters = { ...filters };
  if (!_filters.clientApp && api.clientApp) {
    log.debug(
      `No clientApp found in filters; using api.clientApp (${api.clientApp})`);
    _filters.clientApp = api.clientApp;
  }
  // TODO: This loads Firefox personas (lightweight themes) for Android
  // until github.com/mozilla/addons-frontend/issues/1723#issuecomment-278793546
  // and https://github.com/mozilla/addons-server/issues/4766 are addressed.
  // Essentially: right now there are no categories for the combo
  // of "Android" + "Themes" but Firefox lightweight themes will work fine
  // on mobile so we request "Firefox" + "Themes" for Android instead.
  // Obviously we need to fix this on the API end so our requests aren't
  // overridden, but for now this will work.
  if (
    _filters.clientApp === 'android' && _filters.addonType === ADDON_TYPE_THEME
  ) {
    log.info(dedent`addonType: ${_filters.addonType}/clientApp:
      ${_filters.clientApp} is not supported. Changing clientApp to "firefox"`);
    _filters.clientApp = 'firefox';
  }
  return callApi({
    endpoint: 'addons/search',
    schema: { results: [addon] },
    params: {
      ...convertFiltersToQueryParams(_filters),
      page,
    },
    state: api,
    auth,
  });
}

export function fetchAddon({ api, slug }) {
  return callApi({
    endpoint: `addons/addon/${slug}`,
    schema: addon,
    auth: true,
    state: api,
  });
}

export function login({ api, code, state }) {
  const params = {};
  const configName = config.get('fxaConfig');
  if (configName) {
    params.config = configName;
  }
  return callApi({
    endpoint: 'accounts/login',
    method: 'post',
    body: { code, state },
    params,
    state: api,
    credentials: true,
  });
}

export function startLoginUrl({ location }) {
  const configName = config.get('fxaConfig');
  const params = { to: url.format({ ...location }) };
  if (configName) {
    params.config = configName;
  }
  const query = makeQueryString(params);
  return `${API_BASE}/accounts/login/start/${query}`;
}

export function fetchProfile({ api }) {
  return callApi({
    endpoint: 'accounts/profile',
    schema: user,
    auth: true,
    state: api,
  });
}

export function featured({ api, filters, page }) {
  return callApi({
    endpoint: 'addons/featured',
    params: {
      app: api.clientApp,
      ...convertFiltersToQueryParams(filters),
      page,
    },
    schema: { results: [addon] },
    state: api,
  });
}

export function categories({ api }) {
  return callApi({
    endpoint: 'addons/categories',
    schema: { results: [category] },
    state: api,
  });
}

export function logOutFromServer({ api }) {
  return callApi({
    auth: true,
    credentials: true,
    endpoint: 'accounts/session',
    method: 'delete',
    state: api,
  });
}
