package com.aetherflow.workflow;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.mapper.ClassPathMapperScanner;
import org.springframework.beans.factory.annotation.AnnotatedBeanDefinition;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.core.type.filter.AssignableTypeFilter;
import org.springframework.util.ClassUtils;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 启动级契约：{@code @MapperScan} 的包名单必须覆盖全部 MyBatis Mapper 接口。
 *
 * <p>本用例不启动 Spring 容器、也不连接数据库：只用 MyBatis 的
 * {@link ClassPathMapperScanner} 在真实 basePackages 上做一次扫描，
 * 断言 Mapper 的 BeanDefinition 被注册，避免默认配置启动时因 bean 缺失而失败。</p>
 */
class WorkflowServiceApplicationMapperScanTest {

    private static final String BASE_PACKAGE = "com.aetherflow.workflow";

    private static List<String> mapperScanPackages() {
        org.mybatis.spring.annotation.MapperScan scan =
                WorkflowServiceApplication.class.getAnnotation(org.mybatis.spring.annotation.MapperScan.class);
        assertThat(scan).as("WorkflowServiceApplication 必须声明 @MapperScan").isNotNull();
        return Arrays.asList(scan.value());
    }

    @Test
    void mapperScanCoversEveryMapperInterfacePackage() {
        List<String> scannedPackages = mapperScanPackages();
        Set<String> mapperPackages = new LinkedHashSet<>();
        for (BeanDefinition definition : mapperInterfaces()) {
            mapperPackages.add(ClassUtils.getPackageName(definition.getBeanClassName()));
        }

        assertThat(mapperPackages)
                .as("扫描不到 Mapper 时覆盖断言没有意义")
                .isNotEmpty();
        assertThat(mapperPackages)
                .as("@MapperScan 名单 = %s", scannedPackages)
                .allSatisfy(mapperPackage -> assertThat(isCovered(mapperPackage, scannedPackages))
                        .as("MyBatis Mapper 包 %s 不在 @MapperScan 覆盖范围内", mapperPackage)
                        .isTrue());
        assertThat(mapperPackages)
                .as("取消清理 Mapper 必须被 @MapperScan 覆盖")
                .anySatisfy(mapperPackage -> assertThat(mapperPackage.toLowerCase(Locale.ROOT))
                        .isEqualTo("com.aetherflow.workflow.runtime.cancellation"));
    }

    @Test
    void registersCancellationCleanupMapperBeanDefinition() {
        DefaultListableBeanFactory registry = new DefaultListableBeanFactory();
        ClassPathMapperScanner scanner = new ClassPathMapperScanner(registry);
        scanner.registerFilters();
        scanner.scan(mapperScanPackages().toArray(String[]::new));

        String beanName = Arrays.stream(registry.getBeanDefinitionNames())
                .filter(name -> name.toLowerCase(Locale.ROOT).contains("workflowcancellationcleanupmapper"))
                .findFirst()
                .orElseThrow(() -> new AssertionError(
                        "@MapperScan 未注册 WorkflowCancellationCleanupMapper，已注册 = "
                                + Arrays.toString(registry.getBeanDefinitionNames())));
        BeanDefinition definition = registry.getBeanDefinition(beanName);
        assertThat(definition.getBeanClassName()).isEqualTo("org.mybatis.spring.mapper.MapperFactoryBean");
        // mybatis-spring 把 mapperInterface 存成 Class，这里按全限定名断言绑定目标。
        Object mapperInterface = definition.getPropertyValues().get("mapperInterface");
        String mapperInterfaceName = mapperInterface instanceof Class<?> type
                ? type.getName()
                : String.valueOf(mapperInterface);
        assertThat(mapperInterfaceName)
                .as("MapperFactoryBean 必须绑定到取消清理 Mapper 接口")
                .isEqualTo("com.aetherflow.workflow.runtime.cancellation.WorkflowCancellationCleanupMapper");
    }

    private static boolean isCovered(String mapperPackage, List<String> scannedPackages) {
        return scannedPackages.stream()
                .anyMatch(scanned -> mapperPackage.equals(scanned) || mapperPackage.startsWith(scanned + "."));
    }

    /**
     * 用元数据扫描找到全部 Mapper 接口（继承 {@link BaseMapper} 或标注 {@link Mapper}），
     * 不加载实现类、不依赖 DataSource。
     */
    private static Set<BeanDefinition> mapperInterfaces() {
        ClassPathScanningCandidateComponentProvider provider =
                new ClassPathScanningCandidateComponentProvider(false) {
                    @Override
                    protected boolean isCandidateComponent(AnnotatedBeanDefinition beanDefinition) {
                        return beanDefinition.getMetadata().isIndependent();
                    }
                };
        provider.addIncludeFilter(new AssignableTypeFilter(BaseMapper.class));
        provider.addIncludeFilter(new AnnotationTypeFilter(Mapper.class));
        return provider.findCandidateComponents(BASE_PACKAGE);
    }
}
