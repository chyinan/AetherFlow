package com.aetherflow.auth.web;

// pattern: Imperative Shell

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class OAuthBrowserStateServiceTest {

    @Test
    void consumesOnlyMatchingProviderStateAndClearsCookie() {
        OAuthBrowserStateService service = new OAuthBrowserStateService();
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new Cookie(OAuthBrowserStateService.GITHUB_COOKIE_NAME, "state-1"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertThat(service.consume("github", "state-1", request, response)).isTrue();
        assertThat(response.getHeader("Set-Cookie"))
                .contains(OAuthBrowserStateService.GITHUB_COOKIE_NAME + "=")
                .contains("Max-Age=0")
                .contains("Path=/");
    }

    @Test
    void rejectsMismatchedStateWithoutAcceptingAnotherProviderCookie() {
        OAuthBrowserStateService service = new OAuthBrowserStateService();
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new Cookie(OAuthBrowserStateService.GITHUB_COOKIE_NAME, "github-state"));

        assertThat(service.matches("google", "github-state", request)).isFalse();
        assertThat(service.matches("github", "other-state", request)).isFalse();
    }
}
