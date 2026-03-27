package com.example.practical_training.controller;

import com.example.practical_training.dto.CompleteLevelRequest;
import com.example.practical_training.dto.LevelStatusResponse;
import com.example.practical_training.service.ProgressService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/progress")
public class ProgressController {

    private final ProgressService progressService;

    public ProgressController(ProgressService progressService) {
        this.progressService = progressService;
    }

    @GetMapping("/levels")
    public List<LevelStatusResponse> levels(HttpSession session) {
        return progressService.listLevels(session);
    }

    @PostMapping("/complete")
    public Map<String, String> complete(@Valid @RequestBody CompleteLevelRequest request, HttpSession session) {
        progressService.completeLevel(request, session);
        return Map.of("status", "ok");
    }
}

