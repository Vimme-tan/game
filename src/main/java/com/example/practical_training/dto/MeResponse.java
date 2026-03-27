package com.example.practical_training.dto;

public class MeResponse {
    private Long playerId;
    private String username;
    private Integer maxUnlockedLevel;
    private Integer volume;

    public Long getPlayerId() {
        return playerId;
    }

    public void setPlayerId(Long playerId) {
        this.playerId = playerId;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public Integer getMaxUnlockedLevel() {
        return maxUnlockedLevel;
    }

    public void setMaxUnlockedLevel(Integer maxUnlockedLevel) {
        this.maxUnlockedLevel = maxUnlockedLevel;
    }

    public Integer getVolume() {
        return volume;
    }

    public void setVolume(Integer volume) {
        this.volume = volume;
    }
}

