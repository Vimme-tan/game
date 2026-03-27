package com.example.practical_training.dto;

public class SaveResponse {
    private Long playerId;
    private Integer levelId;

    public SaveResponse() {}

    public SaveResponse(Long playerId, Integer levelId) {
        this.playerId = playerId;
        this.levelId = levelId;
    }

    public Long getPlayerId() {
        return playerId;
    }

    public void setPlayerId(Long playerId) {
        this.playerId = playerId;
    }

    public Integer getLevelId() {
        return levelId;
    }

    public void setLevelId(Integer levelId) {
        this.levelId = levelId;
    }
}

