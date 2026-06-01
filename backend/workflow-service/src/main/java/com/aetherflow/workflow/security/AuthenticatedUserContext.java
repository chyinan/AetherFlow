package com.aetherflow.workflow.security;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.springframework.util.StringUtils;

import java.util.Objects;
import java.util.function.Supplier;

public final class AuthenticatedUserContext {

    private static final ThreadLocal<AuthenticatedUser> CURRENT = new ThreadLocal<>();

    private AuthenticatedUserContext() {
    }

    public static void set(Long userId, String username) {
        if (userId == null || userId <= 0) {
            clear();
            return;
        }
        CURRENT.set(new AuthenticatedUser(userId, StringUtils.hasText(username) ? username.trim() : null));
    }

    public static Long requireUserId() {
        AuthenticatedUser user = CURRENT.get();
        if (user == null || user.userId() == null || user.userId() <= 0) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "authenticated user is required");
        }
        return user.userId();
    }

    public static String usernameOrDefault(String fallback) {
        AuthenticatedUser user = CURRENT.get();
        return user != null && StringUtils.hasText(user.username()) ? user.username() : fallback;
    }

    public static <T> T runAs(Long userId, String username, Supplier<T> action) {
        Objects.requireNonNull(action, "action must not be null");
        AuthenticatedUser previous = CURRENT.get();
        set(userId, username);
        try {
            return action.get();
        } finally {
            if (previous == null) {
                clear();
            } else {
                CURRENT.set(previous);
            }
        }
    }

    public static void clear() {
        CURRENT.remove();
    }

    private record AuthenticatedUser(Long userId, String username) {
    }
}
