package com.example.practical_training.mapper;

import com.example.practical_training.model.Player;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface PlayerMapper {
    @Select("SELECT id, nickname, password_hash AS passwordHash, max_unlocked_level AS maxUnlockedLevel, volume FROM player WHERE nickname = #{nickname}")
    Player findByNickname(@Param("nickname") String nickname);

    @Select("SELECT id, nickname, password_hash AS passwordHash, max_unlocked_level AS maxUnlockedLevel, volume FROM player WHERE id = #{id}")
    Player findById(@Param("id") Long id);

    @Insert("INSERT INTO player(nickname, password_hash) VALUES(#{nickname}, #{passwordHash})")
    @Options(useGeneratedKeys = true, keyProperty = "id", keyColumn = "id")
    int insert(Player player);

    @org.apache.ibatis.annotations.Update("""
        UPDATE player
        SET
            max_unlocked_level = #{maxUnlockedLevel},
            volume = #{volume}
        WHERE id = #{id}
        """)
    int updateProgressAndSettings(@Param("id") Long id,
                                 @Param("maxUnlockedLevel") int maxUnlockedLevel,
                                 @Param("volume") int volume);

    @Update("""
        UPDATE player
        SET max_unlocked_level = GREATEST(max_unlocked_level, #{maxUnlockedLevel})
        WHERE id = #{id}
        """)
    int bumpMaxUnlockedLevel(@Param("id") Long id, @Param("maxUnlockedLevel") int maxUnlockedLevel);

    @Update("""
        UPDATE player
        SET volume = #{volume}
        WHERE id = #{id}
        """)
    int updateVolume(@Param("id") Long id, @Param("volume") int volume);
}

