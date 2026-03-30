package com.example.practical_training.controller;

import com.example.practical_training.debug.DebugNdjsonLogger;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/debug")
public class DebugLogController {

    public static class ClientLogRequest {
        @NotBlank
        private String runId;
        @NotBlank
        private String hypothesisId;
        @NotBlank
        private String location;
        @NotBlank
        private String message;
        private Map<String, Object> data;

        public String getRunId() { return runId; }
        public void setRunId(String runId) { this.runId = runId; }
        public String getHypothesisId() { return hypothesisId; }
        public void setHypothesisId(String hypothesisId) { this.hypothesisId = hypothesisId; }
        public String getLocation() { return location; }
        public void setLocation(String location) { this.location = location; }
        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
        public Map<String, Object> getData() { return data; }
        public void setData(Map<String, Object> data) { this.data = data; }
    }

    @PostMapping("/log")
    public Map<String, String> log(@Valid @RequestBody ClientLogRequest req) {
        Map<String, Object> safe = new HashMap<>();
        if (req.getData() != null) safe.putAll(req.getData());
        DebugNdjsonLogger.log(req.getRunId(), req.getHypothesisId(), req.getLocation(), req.getMessage(), safe);
        return Map.of("status", "ok");
    }
}

