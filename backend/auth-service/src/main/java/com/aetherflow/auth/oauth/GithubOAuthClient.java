package com.aetherflow.auth.oauth;

public interface GithubOAuthClient {

    String exchangeCode(String code, String redirectUri);

    GithubOAuthUser fetchUser(String accessToken);
}
