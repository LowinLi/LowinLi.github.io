---
title: "AzureOpenAI vs OpenAI"
date: 2023-02-17
updated: 2023-10-06
tags: ["GPT", "AIGC", "OpenAI", "Azure"]
categories: ["技术"]
description: "OpenAI是一家人工智能研究机构，最近几个月发布的ChatGPT火遍全球。OpenAI官方提供了API接口，可以帮助开发者轻松地介入Ada"
shelf: llm
oldUrl: "/2023/02/17/azureopenaivsopenai/"
---

OpenAI是一家人工智能研究机构，最近几个月发布的ChatGPT火遍全球。OpenAI官方提供了API接口，可以帮助开发者轻松地介入Ada、Babbage、Curie、Davinci等模型，尤其是OpenAI发布的text-davinci-003模型，它的通用能力，让大家可以展开prompt的想象力，定制做各种想象得到的任务，甚至把prompt本身作为商品出售，并且已经有这样的[社区](https://link.zhihu.com/?target=https://promptbase.com/marketplace)在卖prompt了。然而，也许是OpenAI的算力资源问题，在2月份，OpenAI的API接口经常会罢工，尤其是2月14日这种国际情人节，不管是API接口，还是官网Playground，都会频繁的抛出错误：

> The server had an error while processing your request. Sorry about that

这个问题让人直挠头，做为开发者，感觉自己小命被別在别人的裤腰带上，没有任何办法。

幸运的是，一个月前在Azure上申请的AzureOpenAI终于批准了，怀着憧憬的心情来了一把测试对比，如下视频所示：

上面这段视频中，左边是Azure提供的OpenAI服务的Playground，右边是OpenAI官网的Playground。在给他同样的输入、同样的模型参数配置、并且两边的temperature都设为0（很重要，因为OpenAI模型入参与另一家Huggingface的transformers库的入参不同，OpenAI的入参没有种子，那么每次Completion的随机性是不固定的，把temperature设为0，即为贪心搜索解码，就可以复现每次的推理）。那么就复现了完全一样的Completion内容。而速度，完全不在一个频道上。

下面，我们来接入AzureOpenAI的API，仅需要在原OpenAI的SDK基础上加入以下两行，然后配置新的OPENAI\_API\_KEY，就可以迁移到Azure上面玩耍了  
![](/posts-media/azureopenaivsopenai/sdk.webp)  
然后，我们定量比较一下两个服务的API的流式响应速度，对于OpenAI的服务，花了23秒跑完126个块、而AzureOpenAI，仅花了4秒就跑完同样的126个块。AzureOpenAI几乎快了一个数量级。  
![](/posts-media/azureopenaivsopenai/ju.webp)

最后，感谢Azure，还没有申请的小伙伴们赶紧抓紧申请了==>[链接](https://link.zhihu.com/?target=https://customervoice.microsoft.com/Pages/ResponsePage.aspx?id=v4j5cvGGr0GRqy180BHbR7en2Ais5pxKtso_Pz4b1_xUOFA5Qk1UWDRBMjg0WFhPMkIzTzhKQ1dWNyQlQCN0PWcu&culture=zh-cn&country=cn)

以及[AzureOpenAI官方文档](https://link.zhihu.com/?target=https://learn.microsoft.com/en-us/azure/cognitive-services/openai/)
