package com.example.practical_training.service;

import com.example.practical_training.dto.SaveRequest;
import com.example.practical_training.dto.SaveResponse;
import com.example.practical_training.mapper.LevelScoreMapper;
import com.example.practical_training.mapper.PlayerMapper;
import com.example.practical_training.mapper.SaveDataMapper;
import com.example.practical_training.model.LevelConfig;
import com.example.practical_training.model.Player;
import com.example.practical_training.model.RankEntry;
import com.example.practical_training.model.SaveData;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Arrays;
import java.util.List;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class GameService {

    private final PlayerMapper playerMapper;
    private final SaveDataMapper saveDataMapper;
    private final LevelScoreMapper levelScoreMapper;

    public GameService(PlayerMapper playerMapper,
                        SaveDataMapper saveDataMapper,
                        LevelScoreMapper levelScoreMapper) {
        this.playerMapper = playerMapper;
        this.saveDataMapper = saveDataMapper;
        this.levelScoreMapper = levelScoreMapper;
    }

    public List<LevelConfig> getAllLevels() {
        return Arrays.asList(level1(), level2(), level3());
    }

    public LevelConfig getLevelConfig(int levelId) {
        return switch (levelId) {
            case 1 -> level1();
            case 2 -> level2();
            case 3 -> level3();
            default -> throw new ResponseStatusException(NOT_FOUND, "Level not found: " + levelId);
        };
    }

    @Transactional
    public SaveResponse save(SaveRequest request) {
        String nickname = request.getNickname() == null ? null : request.getNickname().trim();
        if (nickname == null || nickname.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "nickname is required");
        }
        if (request.getScore() < 0) {
            throw new ResponseStatusException(BAD_REQUEST, "score must be >= 0");
        }

        Player player = playerMapper.findByNickname(nickname);
        if (player == null) {
            player = new Player();
            player.setNickname(nickname);
            playerMapper.insert(player);
        }

        SaveData saveData = new SaveData();
        saveData.setPlayerId(player.getId());
        saveData.setLevelId(request.getLevelId());
        saveData.setPosX(request.getPosX());
        saveData.setPosY(request.getPosY());
        saveData.setHp(request.getHp());
        saveData.setScore(request.getScore());
        saveDataMapper.upsert(saveData);

        if (request.isFinished()) {
            levelScoreMapper.insert(player.getId(), request.getLevelId(), request.getScore());
        }

        return new SaveResponse(player.getId(), request.getLevelId());
    }

    public List<RankEntry> rank(int levelId, int limit) {
        if (limit <= 0) {
            throw new ResponseStatusException(BAD_REQUEST, "limit must be > 0");
        }
        return levelScoreMapper.topRank(levelId, limit);
    }

    private LevelConfig level1() {
        LevelConfig cfg = new LevelConfig();
        cfg.setLevelId(1);
        cfg.setTitle("Level 1");
        cfg.setWidth(40);
        cfg.setHeight(24);
        cfg.setSpawnX(2);
        cfg.setSpawnY(2);
        cfg.setGoalX(36);
        cfg.setGoalY(20);
        return cfg;
    }

    private LevelConfig level2() {
        LevelConfig cfg = new LevelConfig();
        cfg.setLevelId(2);
        cfg.setTitle("Level 2");
        cfg.setWidth(40);
        cfg.setHeight(24);
        cfg.setSpawnX(2);
        cfg.setSpawnY(20);
        cfg.setGoalX(36);
        cfg.setGoalY(2);
        return cfg;
    }

    private LevelConfig level3() {
        LevelConfig cfg = new LevelConfig();
        cfg.setLevelId(3);
        cfg.setTitle("Level 3");
        cfg.setWidth(40);
        cfg.setHeight(24);
        cfg.setSpawnX(2);
        cfg.setSpawnY(12);
        cfg.setGoalX(36);
        cfg.setGoalY(12);
        return cfg;
    }
}

