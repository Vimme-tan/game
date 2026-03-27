package com.example.practical_training.debug;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.HashMap;
import java.util.Map;

public final class DebugNdjsonLogger {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Object LOCK = new Object();
    private static final String SESSION_ID = "377d1b";

    private DebugNdjsonLogger() {}

    public static void log(String runId,
                             String hypothesisId,
                             String location,
                             String message,
                             Map<String, Object> data) {
        try {
            Path logPath = Paths.get("F:/web/project/Practical_training/debug-377d1b.log");

            Map<String, Object> payload = new HashMap<>();
            payload.put("sessionId", SESSION_ID);
            if (runId != null) payload.put("runId", runId);
            if (hypothesisId != null) payload.put("hypothesisId", hypothesisId);
            if (location != null) payload.put("location", location);
            if (message != null) payload.put("message", message);
            if (data != null) payload.put("data", data);
            payload.put("timestamp", System.currentTimeMillis());

            String line = MAPPER.writeValueAsString(payload) + System.lineSeparator();
            synchronized (LOCK) {
                Files.write(
                        logPath,
                        line.getBytes(StandardCharsets.UTF_8),
                        StandardOpenOption.CREATE,
                        StandardOpenOption.APPEND
                );
            }
        } catch (Exception ignored) {
            // Do not throw from debug logger.
        }
    }
}

