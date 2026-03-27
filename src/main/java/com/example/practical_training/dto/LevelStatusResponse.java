package com.example.practical_training.dto;

public class LevelStatusResponse {
    private Integer levelId;
    private String title;
    private boolean unlocked;

    public LevelStatusResponse() {}

    public LevelStatusResponse(Integer levelId, String title, boolean unlocked) {
        this.levelId = levelId;
        this.title = title;
        this.unlocked = unlocked;
    }

    public Integer getLevelId() {
        return levelId;
    }

    public void setLevelId(Integer levelId) {
        this.levelId = levelId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public boolean isUnlocked() {
        return unlocked;
    }

    public void setUnlocked(boolean unlocked) {
        this.unlocked = unlocked;
    }
}

