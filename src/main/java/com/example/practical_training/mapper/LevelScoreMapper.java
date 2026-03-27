package com.example.practical_training.mapper;

import com.example.practical_training.model.RankEntry;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface LevelScoreMapper {
    @Insert("INSERT INTO level_score(player_id, level_id, score) VALUES (#{playerId}, #{levelId}, #{score})")
    int insert(@Param("playerId") Long playerId,
               @Param("levelId") Integer levelId,
               @Param("score") Integer score);

    @Select("""
        SELECT
            p.nickname AS nickname,
            MAX(ls.score) AS best_score
        FROM level_score ls
        JOIN player p ON p.id = ls.player_id
        WHERE ls.level_id = #{levelId}
        GROUP BY ls.player_id, p.nickname
        ORDER BY best_score DESC, p.nickname ASC
        LIMIT #{limit}
        """)
    List<RankEntry> topRank(@Param("levelId") Integer levelId, @Param("limit") int limit);
}

