package com.example.practical_training.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public class VolumeRequest {
    @NotNull(message = "volume is required")
    @Min(value = 0, message = "volume must be between 0 and 100")
    @Max(value = 100, message = "volume must be between 0 and 100")
    private Integer volume;

    public Integer getVolume() {
        return volume;
    }

    public void setVolume(Integer volume) {
        this.volume = volume;
    }
}
