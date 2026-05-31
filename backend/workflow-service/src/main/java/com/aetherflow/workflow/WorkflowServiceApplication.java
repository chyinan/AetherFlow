package com.aetherflow.workflow;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.cloud.openfeign.EnableFeignClients;

@EnableDiscoveryClient
@EnableFeignClients(basePackages = "com.aetherflow.workflow.client")
@MapperScan({
        "com.aetherflow.workflow.mapper",
        "com.aetherflow.workflow.knowledge.mapper",
        "com.aetherflow.workflow.project.mapper"
})
@SpringBootApplication(scanBasePackages = "com.aetherflow")
public class WorkflowServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(WorkflowServiceApplication.class, args);
    }
}

