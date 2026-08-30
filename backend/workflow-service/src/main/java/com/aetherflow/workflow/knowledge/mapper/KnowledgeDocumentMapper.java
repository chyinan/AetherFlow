package com.aetherflow.workflow.knowledge.mapper;

import com.aetherflow.workflow.knowledge.entity.KnowledgeDocumentEntity;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface KnowledgeDocumentMapper extends BaseMapper<KnowledgeDocumentEntity> {

    @Update("""
            UPDATE af_knowledge_document
            SET recall_count = recall_count + 1,
                updated_at = #{updatedAt}
            WHERE id = #{documentId}
            """)
    int incrementRecall(@Param("documentId") Long documentId,
                        @Param("updatedAt") LocalDateTime updatedAt);
}
