package com.example.practical_training.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class PageController {

    @GetMapping({"/game", "/game/"})
    public String gameHome() {
        return "forward:/game/index.html";
    }
}

