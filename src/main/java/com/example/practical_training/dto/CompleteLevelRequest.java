package com.example.practical_training.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public class CompleteLevelRequest {
    @NotNull
    @Min(1)
    private Integer levelId;

    @NotNull
    @Min(0)
    private Integer score;

    public Integer getLevelId() {
        return levelId;
    }

    public void setLevelId(Integer levelId) {
        this.levelId = levelId;
    }

    public Integer getScore() {
        return score;
    }

    public void setScore(Integer score) {
        this.score = score;
    }
}

