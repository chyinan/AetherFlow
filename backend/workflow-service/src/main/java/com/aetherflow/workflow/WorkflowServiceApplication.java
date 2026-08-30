package com.aetherflow.workflow;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableDiscoveryClient
@EnableFeignClients(basePackages = "com.aetherflow.workflow.client")
@EnableScheduling
@MapperScan({
        "com.aetherflow.workflow.mapper",
        "com.aetherflow.workflow.knowledge.mapper",
        "com.aetherflow.workflow.project.mapper",
        "com.aetherflow.workflow.embedding.store",
        "com.aetherflow.workflow.knowledge.ingestion"
})
@SpringBootApplication(scanBasePackages = "com.aetherflow")
public class WorkflowServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(WorkflowServiceApplication.class, args);
    }
}

