// @ts-nocheck
import { connect } from 'react-redux';

export const withSetupWizard = (mapState) => {
  const mapStateToProps = (state, props) => {
    const {
      isOrganizationSetupCompleted,
      isOrganizationReady,
      isOrganizationBuildRunning
    } = props;

    const condits = {
      isInitializingStep: isOrganizationBuildRunning,
      isOrganizationStep: !isOrganizationReady && !isOrganizationBuildRunning,
    };
    const scenarios = [
      { condition: condits.isOrganizationStep, step: 'organization' },
      { condition: condits.isInitializingStep, step: 'initializing' },
    ];
    const setupStep = scenarios.find((scenario) => scenario.condition);
    const mapped = {
      ...condits,
      setupStepId: setupStep?.step,
      setupStepIndex: scenarios.indexOf(setupStep),
    };
    return mapState ? mapState(mapped, state, props) : mapped;
  };
  return connect(mapStateToProps);
};
