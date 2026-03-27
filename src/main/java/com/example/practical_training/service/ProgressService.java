package com.example.practical_training.service;

import com.example.practical_training.dto.CompleteLevelRequest;
import com.example.practical_training.dto.LevelStatusResponse;
import com.example.practical_training.mapper.LevelScoreMapper;
import com.example.practical_training.mapper.PlayerMapper;
import com.example.practical_training.model.LevelConfig;
import com.example.practical_training.model.Player;
import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@Service
public class ProgressService {

    private final AuthService authService;
    private final PlayerMapper playerMapper;
    private final GameService gameService;
    private final LevelScoreMapper levelScoreMapper;

    public ProgressService(AuthService authService,
                           PlayerMapper playerMapper,
                           GameService gameService,
                           LevelScoreMapper levelScoreMapper) {
        this.authService = authService;
        this.playerMapper = playerMapper;
        this.gameService = gameService;
        this.levelScoreMapper = levelScoreMapper;
    }

    public List<LevelStatusResponse> listLevels(HttpSession session) {
        Long playerId = (Long) session.getAttribute(AuthService.SESSION_PLAYER_ID);
        if (playerId == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "not logged in");
        }
        Player player = playerMapper.findById(playerId);
        if (player == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "not logged in");
        }
        int maxUnlocked = player.getMaxUnlockedLevel() == null ? 1 : player.getMaxUnlockedLevel();
        List<LevelConfig> levels = gameService.getAllLevels();
        return levels.stream()
                .map(l -> new LevelStatusResponse(l.getLevelId(), l.getTitle(), l.getLevelId() <= maxUnlocked))
                .toList();
    }

    @Transactional
    public void completeLevel(CompleteLevelRequest request, HttpSession session) {
        Long playerId = (Long) session.getAttribute(AuthService.SESSION_PLAYER_ID);
        if (playerId == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "not logged in");
        }
        Player player = playerMapper.findById(playerId);
        if (player == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "not logged in");
        }

        int levelId = request.getLevelId();
        if (levelId < 1) {
            throw new ResponseStatusException(BAD_REQUEST, "invalid levelId");
        }

        // record score
        levelScoreMapper.insert(playerId, levelId, request.getScore());

        int currentUnlocked = player.getMaxUnlockedLevel() == null ? 1 : player.getMaxUnlockedLevel();
        int maxLevel = gameService.getAllLevels().stream().mapToInt(LevelConfig::getLevelId).max().orElse(1);

        // unlock next only when completing the current highest unlocked
        if (levelId == currentUnlocked && currentUnlocked < maxLevel) {
            playerMapper.bumpMaxUnlockedLevel(playerId, currentUnlocked + 1);
        }
    }
}

