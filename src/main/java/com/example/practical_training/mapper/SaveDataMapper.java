package com.example.practical_training.mapper;

import com.example.practical_training.model.SaveData;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SaveDataMapper {
    @Insert("""
        INSERT INTO save_data (player_id, level_id, pos_x, pos_y, hp, score)
        VALUES (#{playerId}, #{levelId}, #{posX}, #{posY}, #{hp}, #{score})
        ON DUPLICATE KEY UPDATE
            pos_x = VALUES(pos_x),
            pos_y = VALUES(pos_y),
            hp = VALUES(hp),
            score = VALUES(score),
            updated_at = CURRENT_TIMESTAMP
        """)
    int upsert(SaveData saveData);
}

