package com.aetherflow.workflow.runtime.config;

import com.aetherflow.workflow.runtime.api.NodeExecutor;
import com.aetherflow.workflow.runtime.api.NodeRegistry;
import com.aetherflow.workflow.runtime.api.RuntimeEventPublisher;
import com.aetherflow.workflow.runtime.core.RuntimeStateMachine;
import com.aetherflow.workflow.runtime.engine.RuntimeSleeper;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeEngine;
import com.aetherflow.workflow.runtime.event.CompositeRuntimeEventPublisher;
import com.aetherflow.workflow.runtime.event.RabbitRuntimeEventPublisher;
import com.aetherflow.workflow.runtime.metrics.WorkflowRuntimeMetrics;
import com.aetherflow.workflow.runtime.observability.InMemoryRuntimeObservationStore;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.ArrayList;
import java.util.List;

@Configuration
@EnableConfigurationProperties(WorkflowRuntimeProperties.class)
public class WorkflowRuntimeConfig {

    @Bean
    public NodeRegistry nodeRegistry(List<NodeExecutor> executors) {
        return new NodeRegistry(executors);
    }

    @Bean
    public RuntimeStateMachine runtimeStateMachine() {
        return new RuntimeStateMachine();
    }

    @Bean
    public RuntimeSleeper runtimeSleeper() {
        return RuntimeSleeper.threadSleep();
    }

    @Bean
    public WorkflowRuntimeMetrics workflowRuntimeMetrics() {
        return new WorkflowRuntimeMetrics();
    }

    @Bean
    public InMemoryRuntimeObservationStore runtimeObservationStore(WorkflowRuntimeProperties properties) {
        return new InMemoryRuntimeObservationStore(properties.getObservability().getMaxEventsPerWorkflow());
    }

    @Bean
    public RabbitRuntimeEventPublisher rabbitRuntimeEventPublisher(ObjectProvider<RabbitTemplate> rabbitTemplateProvider,
                                                                   WorkflowRuntimeProperties properties) {
        return new RabbitRuntimeEventPublisher(rabbitTemplateProvider.getIfAvailable(), properties);
    }

    @Bean
    public RuntimeEventPublisher runtimeEventPublisher(WorkflowRuntimeMetrics metrics,
                                                       InMemoryRuntimeObservationStore observationStore,
                                                       RabbitRuntimeEventPublisher rabbitRuntimeEventPublisher) {
        List<RuntimeEventPublisher> publishers = new ArrayList<>();
        publishers.add(metrics);
        publishers.add(observationStore);
        publishers.add(rabbitRuntimeEventPublisher);
        return new CompositeRuntimeEventPublisher(publishers);
    }

    @Bean
    public WorkflowRuntimeEngine workflowRuntimeEngine(NodeRegistry nodeRegistry,
                                                       RuntimeStateMachine runtimeStateMachine,
                                                       RuntimeEventPublisher runtimeEventPublisher,
                                                       RuntimeSleeper runtimeSleeper) {
        return new WorkflowRuntimeEngine(nodeRegistry, runtimeStateMachine, runtimeEventPublisher, runtimeSleeper);
    }
}
