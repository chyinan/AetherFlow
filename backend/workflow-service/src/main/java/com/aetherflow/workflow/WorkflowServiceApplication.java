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
        "com.aetherflow.workflow.knowledge.ingestion",
        "com.aetherflow.workflow.runtime.notification",
        // 取消清理 Mapper 与取消服务同包，未加入扫描名单时默认配置启动会缺 bean。
        "com.aetherflow.workflow.runtime.cancellation",
        "com.aetherflow.workflow.subworkflow"
})
@SpringBootApplication(scanBasePackages = "com.aetherflow")
public class WorkflowServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(WorkflowServiceApplication.class, args);
    }
}

