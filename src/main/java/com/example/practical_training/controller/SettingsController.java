package com.example.practical_training.controller;

import com.example.practical_training.dto.VolumeRequest;
import com.example.practical_training.service.AuthService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/settings")
public class SettingsController {

    private final AuthService authService;

    public SettingsController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/volume")
    public Map<String, String> updateVolume(@Valid @RequestBody VolumeRequest request, HttpSession session) {
        authService.updateVolume(session, request.getVolume());
        return Map.of("status", "ok");
    }
}
