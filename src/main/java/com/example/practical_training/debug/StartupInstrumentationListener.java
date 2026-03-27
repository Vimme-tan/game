package com.example.practical_training.debug;

import org.springframework.boot.context.event.ApplicationFailedEvent;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class StartupInstrumentationListener {

    private final Environment env;

    public StartupInstrumentationListener(Environment env) {
        this.env = env;
    }

    @EventListener
    public void onApplicationReady(ApplicationReadyEvent event) {
        Map<String, Object> data = new HashMap<>();
        data.put("serverPort", env.getProperty("server.port"));
        data.put("flywayEnabled", env.getProperty("spring.flyway.enabled"));
        DebugNdjsonLogger.log(
                "pre-debug",
                "E_other_startup",
                "StartupInstrumentationListener:onApplicationReady",
                "application_ready",
                data
        );
    }

    @EventListener
    public void onApplicationFailed(ApplicationFailedEvent event) {
        Throwable ex = event.getException();

        List<String> chain = new ArrayList<>();
        Throwable cur = ex;
        while (cur != null && chain.size() < 12) {
            String msg = cur.getMessage();
            if (msg == null) msg = "";
            msg = msg.replaceAll("using password: [A-Za-z]+", "using password: [redacted]");
            msg = msg.replaceAll("password ?= ?[^\\s]+", "password=[redacted]");
            chain.add(cur.getClass().getName() + ":" + msg);
            cur = cur.getCause();
        }
        String joined = String.join(" | ", chain);

        String datasourceUrl = env.getProperty("spring.datasource.url");

        boolean isDatasource = joined.contains("CommunicationsException")
                || joined.contains("CannotGetJdbcConnection")
                || joined.contains("HikariPool")
                || joined.contains("Failed to obtain JDBC Connection");
        boolean isFlyway = joined.contains("Flyway")
                || joined.contains("org.flywaydb");
        boolean isSecurity = joined.contains("Security")
                || joined.contains("org.springframework.security");
        boolean isPort = joined.contains("BindException")
                || joined.contains("Address already in use")
                || joined.contains("Could not start");

        Map<String, Object> base = new HashMap<>();
        base.put("serverPort", env.getProperty("server.port"));
        base.put("flywayEnabled", env.getProperty("spring.flyway.enabled"));
        if (datasourceUrl != null) base.put("datasourceUrl", datasourceUrl);
        base.put("exceptionType", ex == null ? null : ex.getClass().getName());
        base.put("exceptionSummary", ex == null ? null : ex.getMessage());
        base.put("rootCauseChain", joined);

        Map<String, Object> a = new HashMap<>();
        a.put("match", isDatasource);
        a.put("details", base);
        DebugNdjsonLogger.log("pre-debug", "A_datasource_connection", "StartupInstrumentationListener:onApplicationFailed", "startup_failed", a);

        Map<String, Object> b = new HashMap<>();
        b.put("match", isFlyway);
        b.put("details", base);
        DebugNdjsonLogger.log("pre-debug", "B_flyway_migration", "StartupInstrumentationListener:onApplicationFailed", "startup_failed", b);

        Map<String, Object> c = new HashMap<>();
        c.put("match", isSecurity);
        c.put("details", base);
        DebugNdjsonLogger.log("pre-debug", "C_security_or_beans", "StartupInstrumentationListener:onApplicationFailed", "startup_failed", c);

        Map<String, Object> d = new HashMap<>();
        d.put("match", isPort);
        d.put("details", base);
        DebugNdjsonLogger.log("pre-debug", "D_port_conflict", "StartupInstrumentationListener:onApplicationFailed", "startup_failed", d);

        Map<String, Object> e = new HashMap<>();
        e.put("match", true);
        e.put("details", base);
        DebugNdjsonLogger.log("pre-debug", "E_other_startup", "StartupInstrumentationListener:onApplicationFailed", "startup_failed", e);
    }
}

