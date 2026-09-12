FROM maven:3.9.9-eclipse-temurin-17 AS build

ARG SERVICE
WORKDIR /workspace
COPY pom.xml .
COPY lombok.config .
COPY backend ./backend
RUN mvn -pl backend/${SERVICE} -am -DskipTests package

FROM eclipse-temurin:17-jre

ARG SERVICE
ENV TZ=Asia/Shanghai
WORKDIR /app
RUN groupadd -r app && useradd -r -g app app
RUN sed -i 's|http://archive.ubuntu.com/ubuntu/|https://archive.ubuntu.com/ubuntu/|g; s|http://security.ubuntu.com/ubuntu/|https://security.ubuntu.com/ubuntu/|g' /etc/apt/sources.list.d/ubuntu.sources && \
    apt-get -o Acquire::Retries=5 update && \
    apt-get -o Acquire::Retries=5 install -y --no-install-recommends curl && \
    if [ "$SERVICE" = "workflow-service" ]; then \
      apt-get -o Acquire::Retries=5 install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng tesseract-ocr-chi-sim tesseract-ocr-chi-tra; \
    fi && \
    rm -rf /var/lib/apt/lists/*
COPY --from=build /workspace/backend/${SERVICE}/target/${SERVICE}-0.1.0-SNAPSHOT.jar /app/app.jar
RUN chown -R app:app /app
RUN mkdir -p /home/app/logs/csp && chown -R app:app /home/app
USER app
ENV AETHERFLOW_SERVICE_NAME=${SERVICE}
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 CMD ["sh", "-c", "port=\"$(case \"$AETHERFLOW_SERVICE_NAME\" in gateway-service) echo 8080;; auth-service) echo 8101;; workflow-service) echo 8102;; task-service) echo 8103;; ai-service) echo 8104;; file-service) echo 8105;; notify-service) echo 8106;; *) echo 0;; esac)\"; test \"$port\" != 0 && curl -fsS \"http://127.0.0.1:$port/actuator/health\" >/dev/null || exit 1"]
ENTRYPOINT ["java", "-jar", "/app/app.jar"]

