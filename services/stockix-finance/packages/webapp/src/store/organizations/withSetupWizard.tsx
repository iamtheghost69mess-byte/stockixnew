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
      isCongratsStep:
        isOrganizationReady &&
        !isOrganizationSetupCompleted &&
        !isOrganizationBuildRunning,
    };
    const scenarios = [
      { condition: condits.isOrganizationStep, step: 'organization' },
      { condition: condits.isInitializingStep, step: 'initializing' },
      { condition: condits.isCongratsStep, step: 'congrats' },
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
