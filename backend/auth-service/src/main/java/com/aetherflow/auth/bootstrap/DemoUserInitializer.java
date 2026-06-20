package com.aetherflow.auth.bootstrap;

import com.aetherflow.auth.config.AuthProperties;
import com.aetherflow.auth.entity.User;
import com.aetherflow.auth.mapper.UserMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Locale;

@Slf4j
@Component
@RequiredArgsConstructor
public class DemoUserInitializer implements ApplicationRunner {

    private static final String ENABLED = "ENABLED";
    private static final String DEV_PROFILE = "dev";

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final AuthProperties authProperties;
    private final Environment environment;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void run(ApplicationArguments args) {
        AuthProperties.DemoUser demoUser = authProperties.getDemoUser();
        if (!demoUser.isEnabled()) {
            return;
        }

        // Defense in depth: the demo seed user (aether.operator / mock-password) must never
        // be created in non-dev environments, even if aetherflow.auth.demo-user.enabled=true
        // was set by accident. Require the active Spring profile to contain `dev`.
        if (!isDevProfile()) {
            log.warn("auth demo user seeding skipped because active profiles {} do not include '{}'; "
                    + "demo user is only allowed in the dev profile", Arrays.toString(environment.getActiveProfiles()), DEV_PROFILE);
            return;
        }

        String username = demoUser.getUsername();
        String email = demoUser.getEmail();
        String password = demoUser.getPassword();
        if (!StringUtils.hasText(username) || !StringUtils.hasText(password)) {
            log.warn("auth demo user seed skipped because username or password is blank");
            return;
        }

        User existing = userMapper.selectOne(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, username.trim())
                .last("limit 1"));
        if (existing != null) {
            return;
        }

        LocalDateTime now = LocalDateTime.now();
        User user = new User();
        user.setUsername(username.trim());
        user.setEmail(normalizeEmail(StringUtils.hasText(email) ? email : username.trim() + "@aetherflow.local"));
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setStatus(ENABLED);
        user.setCreatedAt(now);
        user.setUpdatedAt(now);
        userMapper.insert(user);
        log.info("auth demo user seeded username={}", user.getUsername());
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private boolean isDevProfile() {
        String[] active = environment.getActiveProfiles();
        if (active == null || active.length == 0) {
            // Local run with no explicit profile; treat the default-dev case (see spring.profiles.default)
            // as dev so the demo seed still works for developers who follow the README's local setup.
            String[] defaults = environment.getDefaultProfiles();
            return defaults != null && Arrays.asList(defaults).contains(DEV_PROFILE);
        }
        return Arrays.asList(active).contains(DEV_PROFILE);
    }
}
