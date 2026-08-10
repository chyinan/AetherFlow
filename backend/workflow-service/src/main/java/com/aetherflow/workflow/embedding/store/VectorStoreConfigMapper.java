package com.aetherflow.workflow.embedding.store;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface VectorStoreConfigMapper extends BaseMapper<VectorStoreConfigEntity> {
}
