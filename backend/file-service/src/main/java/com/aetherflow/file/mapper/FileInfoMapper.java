package com.aetherflow.file.mapper;

import com.aetherflow.file.entity.FileInfo;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface FileInfoMapper extends BaseMapper<FileInfo> {

    @Select("""
            SELECT *
            FROM af_file_info
            WHERE file_hash = #{hash}
              AND status = 'AVAILABLE'
            ORDER BY id ASC
            LIMIT 1
            """)
    FileInfo selectFirstAvailableByHash(@Param("hash") String hash);

    @Select("""
            SELECT COUNT(1)
            FROM af_file_info
            WHERE status = 'AVAILABLE'
            """)
    Long countAvailableFiles();

    @Select("""
            SELECT COALESCE(SUM(t.file_size), 0)
            FROM (
                SELECT MAX(file_size) AS file_size
                FROM af_file_info
                WHERE status = 'AVAILABLE'
                GROUP BY COALESCE(file_hash, CONCAT(bucket, ':', object_key))
            ) t
            """)
    Long sumPhysicalStorageSize();

    @Select("""
            SELECT CAST(COALESCE(AVG(upload_duration), 0) AS SIGNED)
            FROM af_file_info
            WHERE upload_duration IS NOT NULL
              AND upload_duration >= 0
            """)
    Long averageUploadDurationMs();

    @Select("""
            SELECT COUNT(1)
            FROM af_file_info
            WHERE status = 'AVAILABLE'
              AND file_hash = #{hash}
            """)
    Long countAvailableByHash(@Param("hash") String hash);

    @Select("""
            SELECT COUNT(1)
            FROM af_file_info
            WHERE status = 'AVAILABLE'
              AND bucket = #{bucket}
              AND object_key = #{objectKey}
            """)
    Long countAvailableByObject(@Param("bucket") String bucket, @Param("objectKey") String objectKey);
}
