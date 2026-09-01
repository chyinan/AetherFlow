FROM maven:3.9.9-eclipse-temurin-17 AS build

ARG SERVICE
WORKDIR /workspace
COPY pom.xml .
COPY backend ./backend
RUN mvn -pl backend/${SERVICE} -am -DskipTests package

FROM eclipse-temurin:17-jre

ARG SERVICE
ENV TZ=Asia/Shanghai
WORKDIR /app
RUN groupadd -r app && useradd -r -g app app
RUN if [ "$SERVICE" = "workflow-service" ]; then \
      apt-get update && \
      apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng tesseract-ocr-chi-sim tesseract-ocr-chi-tra && \
      rm -rf /var/lib/apt/lists/*; \
    fi
COPY --from=build /workspace/backend/${SERVICE}/target/${SERVICE}-0.1.0-SNAPSHOT.jar /app/app.jar
RUN chown -R app:app /app
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]

