/* global window */
import classNames from 'classnames';
import React, { PropTypes } from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';

import InstallSwitch from 'core/components/InstallSwitch';
import { ADDON_TYPE_OPENSEARCH, ADDON_TYPE_THEME } from 'core/constants';
import translate from 'core/i18n/translate';
import log from 'core/logger';
import { getThemeData } from 'core/themePreview';
import {
  getClientCompatibility as _getClientCompatibility,
} from 'core/utils';
import Button from 'ui/components/Button';

import './styles.scss';


export class InstallButtonBase extends React.Component {
  static propTypes = {
    addon: PropTypes.object.isRequired,
    className: PropTypes.string,
    clientApp: PropTypes.string.isRequired,
    getClientCompatibility: PropTypes.func,
    hasAddonManager: PropTypes.bool,
    i18n: PropTypes.object.isRequired,
    installTheme: PropTypes.func.isRequired,
    size: PropTypes.string,
    status: PropTypes.string.isRequired,
    userAgentInfo: PropTypes.string.isRequired,
  }

  static defaultProps = {
    getClientCompatibility: _getClientCompatibility,
  }

  installTheme = (event) => {
    event.preventDefault();
    const { addon, status, installTheme } = this.props;
    installTheme(event.currentTarget, { ...addon, status });
  }

  render() {
    const {
      addon,
      clientApp,
      className,
      getClientCompatibility,
      hasAddonManager,
      i18n,
      size,
      userAgentInfo,
    } = this.props;

    // OpenSearch plugins display their own prompt so using the "Add to Firefox"
    // button regardless on mozAddonManager support is a better UX.
    const useButton = (hasAddonManager !== undefined && !hasAddonManager) ||
      addon.type === ADDON_TYPE_OPENSEARCH;
    let button;

    const { compatible } = getClientCompatibility({
      addon, clientApp, userAgentInfo });

    const buttonIsDisabled = !compatible;
    const buttonClass = classNames('InstallButton-button', {
      'InstallButton-button--disabled': buttonIsDisabled,
    });

    if (addon.type === ADDON_TYPE_THEME) {
      button = (
        <Button
          disabled={buttonIsDisabled}
          data-browsertheme={JSON.stringify(getThemeData(addon))}
          onClick={this.installTheme}
          size={size}
          className={buttonClass}>
          {i18n.gettext('Install Theme')}
        </Button>
      );
    } else if (addon.type === ADDON_TYPE_OPENSEARCH) {
      const onClick = (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (
          !buttonIsDisabled && window.external &&
          'AddSearchProvider' in window.external
        ) {
          log.info('Adding OpenSearch Provider', { addon });
          window.external.AddSearchProvider(addon.installURL);
        }

        return false;
      };
      button = (
        <Button
          className={classNames('Button', buttonClass)}
          disabled={buttonIsDisabled}
          onClick={onClick}
          size={size}
          to={addon.installURL}
        >
          {i18n.gettext('Add to Firefox')}
        </Button>
      );
    } else {
      const onClick = buttonIsDisabled ? (event) => {
        event.preventDefault();
        event.stopPropagation();
        return false;
      } : null;
      button = (
        <Button
          disabled={buttonIsDisabled}
          to={addon.installURL}
          onClick={onClick}
          size={size}
          className={buttonClass}>
          {i18n.gettext('Add to Firefox')}
        </Button>
      );
    }
    return (
      <div className={classNames('InstallButton', className, {
        'InstallButton--use-button': useButton,
        'InstallButton--use-switch': !useButton,
      })}>
        <InstallSwitch {...this.props} className="InstallButton-switch"
          disabled={buttonIsDisabled} />
        {button}
      </div>
    );
  }
}

export function mapStateToProps(state) {
  return {
    clientApp: state.api.clientApp,
    userAgentInfo: state.api.userAgentInfo,
  };
}

export default compose(
  connect(mapStateToProps),
  translate(),
)(InstallButtonBase);
