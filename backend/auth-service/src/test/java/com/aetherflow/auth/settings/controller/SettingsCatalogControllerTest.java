package com.aetherflow.auth.settings.controller;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SettingsCatalogControllerTest {

    @Test
    void settingsCatalogEndpointsExposeUsableEntriesInsteadOfEmptyPlaceholders() {
        assertThat(new DataSourcesController().listDataSources().getData()).isNotEmpty();
        assertThat(new ApiExtensionsController().listApiExtensions().getData()).isNotEmpty();
        assertThat(new EnvVariablesController().listEnvironmentVariables().getData()).isNotEmpty();
        assertThat(new IntegrationsController().listIntegrations().getData()).isNotEmpty();
    }
}
