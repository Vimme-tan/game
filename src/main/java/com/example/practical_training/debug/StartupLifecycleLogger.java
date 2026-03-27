package com.example.practical_training.debug;

import org.springframework.boot.context.event.ApplicationFailedEvent;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.context.event.ApplicationStartedEvent;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

@Component
public class StartupLifecycleLogger {

    @EventListener
    public void onStarted(ApplicationStartedEvent event) {
        // #region agent log
        Map<String, Object> data = new HashMap<>();
        data.put("contextId", event.getApplicationContext().getId());
        data.put("activeProfiles", String.join(",", event.getApplicationContext().getEnvironment().getActiveProfiles()));
        data.put("datasourceUrl", event.getApplicationContext().getEnvironment().getProperty("spring.datasource.url"));
        DebugNdjsonLogger.log(
                "run_startup",
                "H1_started_event",
                "StartupLifecycleLogger:onStarted",
                "application_started_event",
                data
        );
        // #endregion
    }

    @EventListener
    public void onReady(ApplicationReadyEvent event) {
        // #region agent log
        Map<String, Object> data = new HashMap<>();
        data.put("contextId", event.getApplicationContext().getId());
        DebugNdjsonLogger.log(
                "run_startup",
                "H2_ready_event",
                "StartupLifecycleLogger:onReady",
                "application_ready_event",
                data
        );
        // #endregion
    }

    @EventListener
    public void onClosed(ContextClosedEvent event) {
        // #region agent log
        Map<String, Object> data = new HashMap<>();
        data.put("contextId", event.getApplicationContext().getId());
        DebugNdjsonLogger.log(
                "run_startup",
                "H3_context_closed",
                "StartupLifecycleLogger:onClosed",
                "context_closed_event",
                data
        );
        // #endregion
    }

    @EventListener
    public void onFailed(ApplicationFailedEvent event) {
        Throwable ex = event.getException();
        String type = ex == null ? "unknown" : ex.getClass().getName();
        String msg = ex == null ? "none" : String.valueOf(ex.getMessage());
        msg = msg.replaceAll("using password: [A-Za-z]+", "using password: [redacted]");
        msg = msg.replaceAll("password ?= ?[^\\s]+", "password=[redacted]");

        // #region agent log
        Map<String, Object> data = new HashMap<>();
        data.put("exceptionType", type);
        data.put("exceptionMessage", msg);
        DebugNdjsonLogger.log(
                "run_startup",
                "H4_failed_event",
                "StartupLifecycleLogger:onFailed",
                "application_failed_event",
                data
        );
        // #endregion
    }
}
