package com.aetherflow.workflow.runtime.config;

import com.aetherflow.workflow.runtime.api.NodeExecutor;
import com.aetherflow.workflow.runtime.api.NodeRegistry;
import com.aetherflow.workflow.runtime.api.RuntimeEventPublisher;
import com.aetherflow.workflow.runtime.core.RuntimeStateMachine;
import com.aetherflow.workflow.runtime.engine.RuntimeSleeper;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeEngine;
import com.aetherflow.workflow.runtime.event.CompositeRuntimeEventPublisher;
import com.aetherflow.workflow.runtime.event.PersistentRuntimeEventPublisher;
import com.aetherflow.workflow.runtime.event.RabbitRuntimeEventPublisher;
import com.aetherflow.workflow.runtime.event.RuntimeEventStore;
import com.aetherflow.workflow.runtime.metrics.WorkflowRuntimeMetrics;
import com.aetherflow.workflow.runtime.observability.InMemoryRuntimeObservationStore;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.lock.RedisWorkflowRuntimeLock;
import com.aetherflow.workflow.runtime.lock.WorkflowRuntimeLock;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.StringRedisTemplate;

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
    public WorkflowRuntimeLock workflowRuntimeLock(ObjectProvider<StringRedisTemplate> redisTemplateProvider,
                                                   WorkflowRuntimeProperties properties) {
        if (!properties.getLock().isEnabled()) {
            return WorkflowRuntimeLock.noop();
        }
        StringRedisTemplate redisTemplate = redisTemplateProvider.getIfAvailable();
        if (redisTemplate == null) {
            return WorkflowRuntimeLock.noop();
        }
        return new RedisWorkflowRuntimeLock(redisTemplate, properties.getLock());
    }

    @Bean
    public PersistentRuntimeEventPublisher persistentRuntimeEventPublisher(RuntimeEventStore runtimeEventStore) {
        return new PersistentRuntimeEventPublisher(runtimeEventStore);
    }

    @Bean
    public RuntimeEventPublisher runtimeEventPublisher(WorkflowRuntimeMetrics metrics,
                                                       InMemoryRuntimeObservationStore observationStore,
                                                       PersistentRuntimeEventPublisher persistentRuntimeEventPublisher,
                                                       RabbitRuntimeEventPublisher rabbitRuntimeEventPublisher) {
        List<RuntimeEventPublisher> publishers = new ArrayList<>();
        publishers.add(metrics);
        publishers.add(observationStore);
        publishers.add(persistentRuntimeEventPublisher);
        publishers.add(rabbitRuntimeEventPublisher);
        return new CompositeRuntimeEventPublisher(publishers);
    }

    @Bean
    public WorkflowRuntimeEngine workflowRuntimeEngine(NodeRegistry nodeRegistry,
                                                       RuntimeStateMachine runtimeStateMachine,
                                                       RuntimeEventPublisher runtimeEventPublisher,
                                                       RuntimeSleeper runtimeSleeper,
                                                       RuntimeSnapshotRepository snapshotRepository,
                                                       WorkflowRuntimeLock workflowRuntimeLock) {
        return new WorkflowRuntimeEngine(
                nodeRegistry,
                runtimeStateMachine,
                runtimeEventPublisher,
                runtimeSleeper,
                snapshotRepository,
                workflowRuntimeLock
        );
    }
}
