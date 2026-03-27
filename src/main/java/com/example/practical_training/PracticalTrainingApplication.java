package com.example.practical_training;

import com.example.practical_training.debug.DebugNdjsonLogger;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.mybatis.spring.annotation.MapperScan;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@SpringBootApplication
@MapperScan("com.example.practical_training.mapper")
public class PracticalTrainingApplication {

    public static void main(String[] args) {
        // #region agent log
        DebugNdjsonLogger.log(
                "run_main_pre",
                "Z_main_entry",
                "PracticalTrainingApplication:main",
                "main_entered",
                new HashMap<>(Map.of("argCount", args == null ? 0 : args.length))
        );
        // #endregion

        try {
            SpringApplication.run(PracticalTrainingApplication.class, args);
        } catch (Throwable ex) {
            // #region agent log
            String msg = ex.getMessage();
            if (msg == null) msg = ex.getClass().getName();

            List<String> chain = new ArrayList<>();
            Throwable cur = ex;
            while (cur != null && chain.size() < 14) {
                String cm = cur.getMessage();
                if (cm == null) cm = "";
                cm = cm.replaceAll("using password: [A-Za-z]+", "using password: [redacted]");
                cm = cm.replaceAll("password ?= ?[^\\s]+", "password=[redacted]");
                chain.add(cur.getClass().getName() + ":" + cm);
                cur = cur.getCause();
            }
            String joined = String.join(" | ", chain);

            java.sql.SQLException sqlEx = null;
            Throwable t = ex;
            while (t != null && sqlEx == null) {
                if (t instanceof java.sql.SQLException) {
                    sqlEx = (java.sql.SQLException) t;
                    break;
                }
                t = t.getCause();
            }

            String sqlState = sqlEx == null ? null : sqlEx.getSQLState();
            Integer errorCode = sqlEx == null ? null : sqlEx.getErrorCode();
            String datasourceUrl = System.getProperty("spring.datasource.url");

            Map<String, Object> data = new HashMap<>();
            data.put("exceptionType", ex.getClass().getName());
            data.put("exceptionMessage", msg);
            data.put("rootCauseChain", joined);
            if (sqlState != null) data.put("sqlState", sqlState);
            if (errorCode != null) data.put("errorCode", errorCode);
            if (datasourceUrl != null) data.put("datasourceUrl", datasourceUrl);

            DebugNdjsonLogger.log(
                    "run_main_caught",
                    "E_other_startup_main_caught",
                    "PracticalTrainingApplication:main",
                    "main_caught_exception",
                    data
            );
            // #endregion

            throw ex;
        }
    }

}
