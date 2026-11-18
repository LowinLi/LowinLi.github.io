---
title: "Transformers仓库解读之序"
date: 2021-09-18
updated: 2023-10-06
tags: ["transformers", "分享"]
categories: ["技术"]
description: "Transformers仓库是HuggingFace公司开源的非常火的预训练模型仓库，它把预训练模型处理的流程抽象包装成了高级的api接口，"
shelf: tf
oldUrl: "/2021/09/18/transformers-xu/"
---

Transformers仓库是HuggingFace公司开源的非常火的预训练模型仓库，它把预训练模型处理的流程抽象包装成了高级的api接口，非常适合掉包侠快速使用。但如果是新手第一次分析源码，拆开一步步的功能的话，是有一定学习成本的。而且仓库源码太多，涉及到方方面面的细节，一时间难以抓住重点。

* * *

介于此，作为掉包侠的我，尝试将仓库各个模块从类的角度拆分，结合实操代码，系统分析每个模块基本功能。

![](/posts-media/transformers-xu/transformers_.webp)

[Transformers仓库解读之一DataCollator](https://lowin.li/2021/09/25/transformers%E4%B8%80DataCollator/)
