---
title: "elasticsearch数据库的向量存储"
date: 2020-11-15
updated: 2023-10-06
tags: ["elasticsearch", "vector", "storage"]
categories: ["技术"]
description: "elasticsearch在7+的版本上，支持把向量存储入字段中，进行距离搜索，本文记录了向量存储数据库的硬盘占用情况"
shelf: eng
oldUrl: "/2020/11/15/elasticsearch-shu-ju-ku-de-xiang-liang-cun-chu/"
---

### 简要

elasticsearch在7+的版本上，支持把向量存储入字段中，进行距离搜索，本文记录了向量存储数据库的硬盘占用情况

### 1\. 在es数据库上mapping向量字段数据类型

#### 1.1 [dense\_vector](https://www.elastic.co/guide/en/elasticsearch/reference/current/dense-vector.html)

> A dense\_vector field stores dense vectors of float values. The maximum number of dimensions that can be in a vector should not exceed 2048. A dense\_vector field is a single-valued field.

-   mapping示例
    
    ```
    PUT my-index-000001
    {
      "mappings": {
        "properties": {
          "my_vector": {
            "type": "dense_vector",
            "dims": 3  
          },
          "my_text" : {
            "type" : "keyword"
          }
        }
      }
    }
    ```
    
    #### 1.2 [sparse\_vector](https://www.elastic.co/guide/en/elasticsearch/reference/current/sparse-vector.html)
    
    > A sparse\_vector field stores sparse vectors of float values. The maximum number of dimensions that can be in a vector should not exceed 1024. The number of dimensions can be different across documents. A sparse\_vector field is a single-valued field.
    
-   mapping示例
    
    ```
    PUT my-index-000001
    {
      "mappings": {
        "properties": {
          "my_vector": {
            "type": "sparse_vector"
          },
          "my_text" : {
            "type" : "keyword"
          }
        }
      }
    }
    ```
    
-   官网说了向量里元素是float数据类型，但是没有找到可以调整float64还是float32，只找到设置向量维度（dims）
    

### 2\. 在es数据库上存储向量占用空间

以长度为50的dense vector向量数据类型为例子：

1.  分别创建4个index，依次命名为ict\_1num\_idf、ict\_1num\_idf\_and\_vec、ict\_7num\_idf、ict\_7num\_idf\_and\_vec
2.  4个index中，分别插入ict语料6千条，第一个index插入计算1组逆词频、第二个index插入计算1组逆词频和句向量、第三个index插入计算7组逆词频、第四个index插入计算7组逆词频和句向量，占用硬盘空间如下：

![](/posts-media/elasticsearch-shu-ju-ku-de-xiang-liang-cun-chu/elasticsearch-densevector.png)

**结论：**

1.  用第二个index占用空间减去第一个占用空间，以及第四个减第三个，可知：es数据库插入向量共多出6M空间，如果不考虑其他因素，按照比例约算，6M除以6千条，一条50维度float词向量占用1KB。（可能会有少许一次性创建字段的空间占用）
    
2.  elasticsearch 使用java开发，所以[查了一下](https://www.w3schools.com/java/java_data_types.asp)java中，float数据一条占4B，所以一条向量50个float，占比200B，至于怎么从200B到1KB的，还没来得及想。
    
3.  直觉上在产品上多几M硬盘空间应该不碍事
    

### 3\. 附录

计算多个文档分析器计算多组逆词频的方式：

```
"mappings": {
          "properties": {
              "sentence: {
                  "type": "keyword",
                  "fields": {
                      "stop":{
                          "type": "text",
                          "similarity" : "bm25",
                          "analyzer": "stopwords_analyzer",
                          "search_analyzer": "stopwords_analyzer"
                      },
                      "ngram": {
                          "type": "text",
                          "similarity" : "bm25",
                          "analyzer": "ngram_analyzer",
                          "search_analyzer": "ngram_analyzer"
                      },
                      "lowercase":{
                          "type": "text",
                          "similarity" : "bm25",
                          "analyzer": "lowercase",
                          "search_analyzer": "lowercase"
                      },
                      "edge_ngram":{
                          "type": "text",
                          "similarity" : "bm25",
                          "analyzer": "edge_ngram_analyzer",
                          "search_analyzer": "edge_ngram_analyzer"
                      },
                      "edge_ngram_stop":{
                          "type": "text",
                          "similarity" : "bm25",
                          "analyzer": "edge_ngram_analyzer_stop",
                          "search_analyzer": "edge_ngram_analyzer_stop"
                      },
                      "ik":{
                          "type": "text",
                          "similarity" : "bm25",
                          "analyzer": "ik_max_word",
                          "search_analyzer": "ik_smart"
                      },
                      "ik_stop":{
                          "type": "text",
                          "similarity" : "bm25",
                          "analyzer": "ik_max_word_stop",
                          "search_analyzer": "ik_smart_stop"
                      }

                  }
              },
```
