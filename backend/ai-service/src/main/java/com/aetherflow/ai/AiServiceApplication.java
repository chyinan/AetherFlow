package com.aetherflow.ai;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableDiscoveryClient
@EnableFeignClients(basePackages = "com.aetherflow.ai.client")
@EnableScheduling
@MapperScan({"com.aetherflow.ai.mapper", "com.aetherflow.ai.copilot.mapper"})
@SpringBootApplication(scanBasePackages = "com.aetherflow")
public class AiServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(AiServiceApplication.class, args);
    }
}

