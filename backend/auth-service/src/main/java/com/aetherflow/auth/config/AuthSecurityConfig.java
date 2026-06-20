package com.aetherflow.auth.config;

import com.aetherflow.auth.oauth.GoogleOAuthFailureHandler;
import com.aetherflow.auth.oauth.GoogleOAuthSuccessHandler;
import com.aetherflow.auth.oauth.RedisOAuth2AuthorizationRequestRepository;
import com.aetherflow.common.security.JwtProperties;
import com.aetherflow.common.security.JwtTokenProvider;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.InMemoryOAuth2AuthorizedClientService;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientService;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.config.http.SessionCreationPolicy;

@Configuration
@EnableConfigurationProperties({JwtProperties.class, AuthProperties.class})
public class AuthSecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public JwtTokenProvider jwtTokenProvider(JwtProperties jwtProperties, Environment environment) {
        // The 2-arg constructor runs JwtSecretValidator with the active environment, so a blank
        // or known-weak JWT_SECRET causes the context to fail loading in non-dev profiles.
        return new JwtTokenProvider(jwtProperties, environment);
    }

    @Bean
    public SecurityFilterChain authSecurityFilterChain(
            HttpSecurity http,
            RedisOAuth2AuthorizationRequestRepository authorizationRequestRepository,
            GoogleOAuthSuccessHandler successHandler,
            GoogleOAuthFailureHandler failureHandler,
            ObjectProvider<ClientRegistrationRepository> clientRegistrationRepository) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers("/auth/**", "/oauth2/**", "/login/oauth2/**",
                                "/actuator/**", "/health", "/v3/api-docs/**", "/swagger-ui/**", "/webjars/**")
                        .permitAll()
                        .anyRequest().permitAll());

        if (clientRegistrationRepository.getIfAvailable() != null) {
            http.oauth2Login(oauth2 -> oauth2
                    .authorizationEndpoint(authorization -> authorization
                            .authorizationRequestRepository(authorizationRequestRepository))
                    .successHandler(successHandler)
                    .failureHandler(failureHandler));
        }

        return http.build();
    }

    @Bean
    @ConditionalOnExpression("T(org.springframework.util.StringUtils).hasText('${aetherflow.auth.oauth.google.client-id:}') "
            + "&& T(org.springframework.util.StringUtils).hasText('${aetherflow.auth.oauth.google.client-secret:}')")
    public ClientRegistrationRepository clientRegistrationRepository(AuthProperties authProperties) {
        AuthProperties.OAuth.Google google = authProperties.getOauth().getGoogle();
        ClientRegistration googleRegistration = CommonOAuth2Provider.GOOGLE.getBuilder("google")
                .clientId(google.getClientId())
                .clientSecret(google.getClientSecret())
                .redirectUri(googleRedirectUri(google))
                .scope("openid", "profile", "email")
                .build();
        return new InMemoryClientRegistrationRepository(googleRegistration);
    }

    @Bean
    @ConditionalOnExpression("T(org.springframework.util.StringUtils).hasText('${aetherflow.auth.oauth.google.client-id:}') "
            + "&& T(org.springframework.util.StringUtils).hasText('${aetherflow.auth.oauth.google.client-secret:}')")
    public OAuth2AuthorizedClientService authorizedClientService(
            ClientRegistrationRepository clientRegistrationRepository) {
        return new InMemoryOAuth2AuthorizedClientService(clientRegistrationRepository);
    }

    private String googleRedirectUri(AuthProperties.OAuth.Google google) {
        return org.springframework.util.StringUtils.hasText(google.getRedirectUri())
                ? google.getRedirectUri()
                : "{baseUrl}/login/oauth2/code/{registrationId}";
    }
}

