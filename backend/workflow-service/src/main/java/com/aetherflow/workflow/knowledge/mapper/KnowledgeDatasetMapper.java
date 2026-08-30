package com.aetherflow.workflow.knowledge.mapper;

import com.aetherflow.workflow.knowledge.entity.KnowledgeDatasetEntity;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;

@Mapper
public interface KnowledgeDatasetMapper extends BaseMapper<KnowledgeDatasetEntity> {

    @Update("""
            UPDATE af_knowledge_dataset
            SET document_count = document_count + 1,
                processing_document_count = 0,
                chunk_count = chunk_count + #{chunkCount},
                updated_at = #{updatedAt}
            WHERE id = #{datasetId}
            """)
    int incrementDocumentCounters(@Param("datasetId") Long datasetId,
                                  @Param("chunkCount") int chunkCount,
                                  @Param("updatedAt") LocalDateTime updatedAt);

    @Update("""
            UPDATE af_knowledge_dataset
            SET document_count = GREATEST(document_count - 1, 0),
                chunk_count = GREATEST(chunk_count - #{chunkCount}, 0),
                updated_at = #{updatedAt}
            WHERE id = #{datasetId}
            """)
    int decrementDocumentCounters(@Param("datasetId") Long datasetId,
                                  @Param("chunkCount") int chunkCount,
                                  @Param("updatedAt") LocalDateTime updatedAt);
}
