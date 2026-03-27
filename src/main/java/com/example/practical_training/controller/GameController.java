package com.example.practical_training.controller;

import com.example.practical_training.dto.SaveRequest;
import com.example.practical_training.dto.SaveResponse;
import com.example.practical_training.model.LevelConfig;
import com.example.practical_training.model.RankEntry;
import com.example.practical_training.service.GameService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

import static org.springframework.http.MediaType.APPLICATION_JSON_VALUE;

@RestController
@RequestMapping("/api")
public class GameController {

    private final GameService gameService;

    public GameController(GameService gameService) {
        this.gameService = gameService;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }

    @GetMapping("/levels/{levelId}")
    public LevelConfig level(@PathVariable int levelId) {
        return gameService.getLevelConfig(levelId);
    }

    @PostMapping(value = "/save", consumes = APPLICATION_JSON_VALUE)
    public SaveResponse save(@Valid @RequestBody SaveRequest request) {
        return gameService.save(request);
    }

    @GetMapping("/rank")
    public List<RankEntry> rank(@RequestParam int levelId,
                                   @RequestParam(defaultValue = "10") int limit) {
        return gameService.rank(levelId, limit);
    }
}

