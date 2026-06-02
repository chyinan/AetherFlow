package com.aetherflow.auth.bootstrap;

import com.aetherflow.auth.config.AuthProperties;
import com.aetherflow.auth.entity.User;
import com.aetherflow.auth.mapper.UserMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Locale;

@Slf4j
@Component
@RequiredArgsConstructor
public class DemoUserInitializer implements ApplicationRunner {

    private static final String ENABLED = "ENABLED";

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final AuthProperties authProperties;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void run(ApplicationArguments args) {
        AuthProperties.DemoUser demoUser = authProperties.getDemoUser();
        if (!demoUser.isEnabled()) {
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
}
