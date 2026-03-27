package com.example.practical_training.service;

import com.example.practical_training.dto.LoginRequest;
import com.example.practical_training.dto.MeResponse;
import com.example.practical_training.dto.RegisterRequest;
import com.example.practical_training.mapper.PlayerMapper;
import com.example.practical_training.model.Player;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import jakarta.servlet.http.HttpSession;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@Service
public class AuthService {

    public static final String SESSION_PLAYER_ID = "playerId";

    private final PlayerMapper playerMapper;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public AuthService(PlayerMapper playerMapper) {
        this.playerMapper = playerMapper;
    }

    public MeResponse register(RegisterRequest request, HttpSession session) {
        String username = normalizeUsername(request.getUsername());
        if (username.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "username is required");
        }

        Player existing = playerMapper.findByNickname(username);
        if (existing != null) {
            throw new ResponseStatusException(CONFLICT, "username already exists");
        }

        Player player = new Player();
        player.setNickname(username);
        player.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        playerMapper.insert(player);

        session.setAttribute(SESSION_PLAYER_ID, player.getId());
        return toMe(playerMapper.findById(player.getId()));
    }

    public MeResponse login(LoginRequest request, HttpSession session) {
        String username = normalizeUsername(request.getUsername());
        Player player = playerMapper.findByNickname(username);
        if (player == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "invalid username or password");
        }
        if (!passwordEncoder.matches(request.getPassword(), player.getPasswordHash())) {
            throw new ResponseStatusException(UNAUTHORIZED, "invalid username or password");
        }
        session.setAttribute(SESSION_PLAYER_ID, player.getId());
        return toMe(playerMapper.findById(player.getId()));
    }

    public void logout(HttpSession session) {
        session.removeAttribute(SESSION_PLAYER_ID);
    }

    public MeResponse me(HttpSession session) {
        Long playerId = (Long) session.getAttribute(SESSION_PLAYER_ID);
        if (playerId == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "not logged in");
        }
        Player player = playerMapper.findById(playerId);
        if (player == null) {
            session.removeAttribute(SESSION_PLAYER_ID);
            throw new ResponseStatusException(UNAUTHORIZED, "not logged in");
        }
        return toMe(player);
    }

    public void updateVolume(HttpSession session, int volume) {
        Long playerId = (Long) session.getAttribute(SESSION_PLAYER_ID);
        if (playerId == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "not logged in");
        }
        Player player = playerMapper.findById(playerId);
        if (player == null) {
            session.removeAttribute(SESSION_PLAYER_ID);
            throw new ResponseStatusException(UNAUTHORIZED, "not logged in");
        }
        playerMapper.updateVolume(playerId, volume);
    }

    private static String normalizeUsername(String raw) {
        if (raw == null) return "";
        return raw.trim();
    }

    private static MeResponse toMe(Player p) {
        MeResponse r = new MeResponse();
        r.setPlayerId(p.getId());
        r.setUsername(p.getNickname());
        r.setMaxUnlockedLevel(p.getMaxUnlockedLevel());
        r.setVolume(p.getVolume());
        return r;
    }
}

