package com.aetherflow.ai.copilot.mapper;

import com.aetherflow.ai.copilot.entity.CopilotConversationEntity;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface CopilotConversationMapper extends BaseMapper<CopilotConversationEntity> {

    @Select("SELECT * FROM af_copilot_conversation WHERE id = #{id} AND user_id = #{userId} AND status = 'active' FOR UPDATE")
    CopilotConversationEntity selectOwnedForUpdate(@Param("id") Long id, @Param("userId") Long userId);
}
