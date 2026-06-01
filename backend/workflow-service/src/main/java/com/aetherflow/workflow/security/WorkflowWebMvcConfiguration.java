package com.aetherflow.workflow.security;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WorkflowWebMvcConfiguration implements WebMvcConfigurer {

    private final AuthenticatedUserInterceptor authenticatedUserInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authenticatedUserInterceptor)
                .addPathPatterns("/**")
                .excludePathPatterns("/health", "/actuator/**", "/v3/api-docs/**", "/swagger-ui/**", "/workflow/demo/**");
    }
}
