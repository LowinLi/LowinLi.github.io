---
title: "盘点开源“Copilot”，do it yourself"
date: 2022-06-27
updated: 2022-06-28
tags: ["transformers", "nlp", "text generation", "github", "gpt", "onnxruntime", "codegen", "vscode", "fastgpt"]
categories: ["技术"]
description: "盘点开源“Copilot”，do it by yourself%E7%9B%98%E7%82%B9%E5%BC%80%E6%BA%90cop"
shelf: llm
oldUrl: "/2022/06/27/pan-dian-kai-yuan-copilot/"
---

## 目录

-   [盘点开源“Copilot”，do it by yourself](#%E7%9B%98%E7%82%B9%E5%BC%80%E6%BA%90copilotdo-it-by-yourself)
    -   [目录](#%E7%9B%AE%E5%BD%95)
    -   [1.背景](#1%E8%83%8C%E6%99%AF)
    -   [2.简述](#2%E7%AE%80%E8%BF%B0)
    -   [3\. 盘点开源代码生成模型](#3-%E7%9B%98%E7%82%B9%E5%BC%80%E6%BA%90%E4%BB%A3%E7%A0%81%E7%94%9F%E6%88%90%E6%A8%A1%E5%9E%8B)
        -   [3.1. 模型清单](#31-%E6%A8%A1%E5%9E%8B%E6%B8%85%E5%8D%95)
        -   [3.2. 模型测试](#32-%E6%A8%A1%E5%9E%8B%E6%B5%8B%E8%AF%95)
            -   [3.2.1. Python语言代码生成测试1](#321-python%E8%AF%AD%E8%A8%80%E4%BB%A3%E7%A0%81%E7%94%9F%E6%88%90%E6%B5%8B%E8%AF%951)
            -   [3.2.2. Python语言代码生成测试2](#322-python%E8%AF%AD%E8%A8%80%E4%BB%A3%E7%A0%81%E7%94%9F%E6%88%90%E6%B5%8B%E8%AF%952)
            -   [3.2.3. Python语言代码生成测试3](#323-python%E8%AF%AD%E8%A8%80%E4%BB%A3%E7%A0%81%E7%94%9F%E6%88%90%E6%B5%8B%E8%AF%953)
            -   [3.2.4.Vue.js语言代码生成测试4](#324vuejs%E8%AF%AD%E8%A8%80%E4%BB%A3%E7%A0%81%E7%94%9F%E6%88%90%E6%B5%8B%E8%AF%954)
            -   [3.2.5.JavaScript语言代码生成测试5](#325javascript%E8%AF%AD%E8%A8%80%E4%BB%A3%E7%A0%81%E7%94%9F%E6%88%90%E6%B5%8B%E8%AF%955)
        -   [3.3.亮点](#33%E4%BA%AE%E7%82%B9)
        -   [3.4.结论](#34%E7%BB%93%E8%AE%BA)
    -   [4.搭建私有化代码生成服务](#4%E6%90%AD%E5%BB%BA%E7%A7%81%E6%9C%89%E5%8C%96%E4%BB%A3%E7%A0%81%E7%94%9F%E6%88%90%E6%9C%8D%E5%8A%A1)
        -   [4.1. onnx量化压缩](#41-onnx%E9%87%8F%E5%8C%96%E5%8E%8B%E7%BC%A9)
            -   [4.1.1. fastgpt安装方法](#411-fastgpt%E5%AE%89%E8%A3%85%E6%96%B9%E6%B3%95)
            -   [4.1.2. fastgpt快速使用](#412-fastgpt%E5%BF%AB%E9%80%9F%E4%BD%BF%E7%94%A8)
        -   [4.2. 私有化web服务](#42-%E7%A7%81%E6%9C%89%E5%8C%96web%E6%9C%8D%E5%8A%A1)
            -   [4.2.1. docker-compose启动](#421-docker-compose%E5%90%AF%E5%8A%A8)
            -   [4.2.2. 测试](#422-%E6%B5%8B%E8%AF%95)
    -   [5.制作私有化Vscode插件](#5%E5%88%B6%E4%BD%9C%E7%A7%81%E6%9C%89%E5%8C%96vscode%E6%8F%92%E4%BB%B6)
    -   [6.enjoy-coding](#6enjoy-coding)
    -   [附录：](#%E9%99%84%E5%BD%95)
        -   [1\. 推理计算资源](#1-%E6%8E%A8%E7%90%86%E8%AE%A1%E7%AE%97%E8%B5%84%E6%BA%90)

## 1.背景

1.  **[Github Copilot](https://github.com/github-copilot/tp_signup)即将收费**：
    -   Copilot 官方近期宣布结束技术预览，并将在 **2022 年 8 月 22 日**开始收费, 收费标准为每月 10 美元或者每年 100 美元。学生和热门开源项目维护者可以免费使用。
2.  **程序员已经离不开 Copilot**：
    -   Github[声称](https://thenextweb.com/news/github-ai-helps-devs-write-30-less-code-analysis)，当前网站上 1/3 的代码都是在 Copilot 工具下完成的。而笔者也是在使用了半年的 Copilot 后，已经很难离开它的帮助，它已帮我做了很多重复性的编程工作。
3.  **开源代码生成模型**：
    -   [Huggingface Model Hub](https://huggingface.co/models?pipeline_tag=text2text-generation&sort=downloads&search=code)社区有很多开源模型可以直接下载使用，其中不乏一些开源代码生成模型，那么为什么不可以**do it yourself**。
4.  **私有化部署一套”Copilot”**:
    -   如果我们使用开源的代码生成模型自己部署一个代码生成服务，再辅以编辑器/IDE 插件，就可以模拟 Copilot 为自己和同事做代码生成服务。而且还有以下优点：
        1.  免去连 Copilot 偶尔的网络不稳定问题
        2.  免去代码上传 Copilot 的安全问题
        3.  根据自己的编码习惯，已有代码，对开源模型进行二次训练，为自己定制更懂自己的模型

## 2.简述

在本博客中，我们先从用户的角度，盘点一下当前开源代码生成模型的生成效果；然后自己搭建代码生成服务，搭建 Vscode 插件，为自己提供私有化”Copilot”。

## 3\. 盘点开源代码生成模型

### 3.1. 模型清单

| 编号 | 模型 | 参数量 | 贡献者 | 训练语料 | 链接 | 支持 transformers | Huggingface 社区月下载量（May 2022） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | code-autocomplete-distilgpt2-python | 81.91M | [shibing624](https://github.com/shibing624) | Python | [链接](https://github.com/shibing624/code-autocomplete) | ✔️ | 37k |
| 2 | code-autocomplete-gpt2-base | 124.44M | [shibing624](https://github.com/shibing624) | Python | [链接](https://github.com/shibing624/code-autocomplete) | ✔️ | 129 |
| 3 | CodeGPT-small-py-adaptedGPT2 | 124.44M | [Microsoft](https://github.com/microsoft) | Python | [链接](https://huggingface.co/microsoft/CodeGPT-small-py-adaptedGPT2) | ✔️ | 5.57k |
| 4 | CodeGPT-small-java-adaptedGPT2 | 124.44M | [Microsoft](https://github.com/microsoft) | Java | [链接](https://huggingface.co/microsoft/CodeGPT-small-java-adaptedGPT2) | ✔️ | 3.31k |
| 5 | incoder-6B | 6.7B | [Facebook](https://huggingface.co/facebook) | Python JavaScript | [链接](https://huggingface.co/facebook/incoder-6B) | ✔️ | 782 |
| 6 | incoder-1B | 1B | [Facebook](https://huggingface.co/facebook) | Python JavaScript | [链接](https://huggingface.co/facebook/incoder-1B) | ✔️ | 4.53k |
| 7 | codegen-350M-mono | 350M | [Salesforce](https://huggingface.co/Salesforce) | Python | [链接](https://github.com/salesforce/CodeGen) | ❌ | 232 |
| 8 | codegen-2B-mono | 2B | [Salesforce](https://huggingface.co/Salesforce) | Python | [链接](https://github.com/salesforce/CodeGen) | ❌ | 438 |
| 9 | codegen-6B-mono | 6B | [Salesforce](https://huggingface.co/Salesforce) | Python | [链接](https://github.com/salesforce/CodeGen) | ❌ | 180 |
| 10 | codegen-16B-mono | 16B | [Salesforce](https://huggingface.co/Salesforce) | Python | [链接](https://github.com/salesforce/CodeGen) | ❌ | 89 |
| 11 | codegen-350M-multi | 350M | [Salesforce](https://huggingface.co/Salesforce) | multiple programming languages | [链接](https://github.com/salesforce/CodeGen) | ❌ | 160 |
| 12 | codegen-2B-multi | 2B | [Salesforce](https://huggingface.co/Salesforce) | multiple programming languages | [链接](https://github.com/salesforce/CodeGen) | ❌ | 140 |
| 13 | codegen-6B-multi | 6B | [Salesforce](https://huggingface.co/Salesforce) | multiple programming languages | [链接](https://github.com/salesforce/CodeGen) | ❌ | 100 |
| 14 | codegen-16B-multi | 16B | [Salesforce](https://huggingface.co/Salesforce) | multiple programming languages | [链接](https://github.com/salesforce/CodeGen) | ❌ | 30 |
| 15 | gpt-neo-125M-code-search-py | 125.20M | [Flax-community](https://huggingface.co/flax-community) | Python | [链接](https://huggingface.co/flax-community/gpt-neo-125M-code-search-py) | ✔️ | 817 |
| 16 | gpt-neo-125M-code-clippy | 125.20M | [Flax-community](https://huggingface.co/flax-community) | multiple programming languages | [链接](https://huggingface.co/flax-community/gpt-neo-125M-code-clippy) | ✔️ | 397 |
| 17 | GPT2-python-code-generator | 124.44M | [SIC98](https://github.com/SIC98) | Python | [链接](https://github.com/SIC98/GPT2-python-code-generator) | ✔️ | 815 |
| 18 | codeparrot | 1.5B | [CodeParrot](https://huggingface.co/codeparrot) | Python | [链接](https://huggingface.co/codeparrot/codeparrot) | ✔️ | 304 |
| 19 | codeparrot-small | 110M | [CodeParrot](https://huggingface.co/codeparrot) | Python | [链接](https://huggingface.co/codeparrot/codeparrot) | ✔️ | 88 |

-   这里列举了已`code`作为关键字，在[HuggingFace Model Hub](https://huggingface.co/models?pipeline_tag=text-generation&sort=downloads&search=code)搜索 `text generation`类型的模型，过滤掉月下载量在100以下且没有介绍的开源模型。
-   可见大家主要围绕`Python语言做代码生成`

### 3.2. 模型测试

-   下面尝试输入代码，分别测试代码生成模型都能输出什么，看看哪个预训练模型更懂我。
    
-   生成配置统一为：
    
    ```python
    model.generate(
        input_ids=input_ids,
        max_length=64 + input_ids.shape[1],
        temperature=1.0,
        top_k=5,
        top_p=0.95,
        repetition_penalty=1.0,
        do_sample=False,
        num_return_sequences=1,
        length_penalty=2.0,
        num_beam=2,
        early_stopping=True
    )
    ```
    

#### 3.2.1. Python语言代码生成测试1

-   输入原文
    
    ```python
    import torch
    from torch import nn
    import torch.nn.functional as F
    
    
    class TextCNN(nn.Module):
        def __init__(self, vocab_size, embedding_dim, out_channels, hidden_size=128):
            super(TextCNN, self).__init__()
            c_i = 1
            kernel_num = 300
            kernel_sizes = [2, 3]
            self.embeddings = nn.Embedding(vocab_size, embedding_dim, padding_idx=1)
            self.convs = nn.ModuleList(
                [nn.Conv2d(c_i, kernel_num, (k, embedding_dim)) for k in kernel_sizes]
            )
            self.dropout = nn.Dropout(0.5)
            self.fc = nn.Linear(len(kernel_sizes) * kernel_num, out_channels)
    
        def forward(self, x, lengths, train=False):
    ```
    

* * *

-   1.code-autocomplete-distilgpt2-python
    
    ```python
    # type: Tuple[nn.ModuleList[nn.Module] = nn.ModuleList[nn.Module]
    
    # type: nnumpy.Module = nnumpy.ModuleList[nn.ModuleList[nn.Module]
    
    # type: nnumpy.
    ```
    
-   2.code-autocomplete-gpt2-base
    
    ```python
    def forward(x, y=None, y=None, y=None, y=None, y=None, x=None, y=None, y=None, y=None, y=None, y=None, y=None, y=None, y
    ```
    
-   3.CodeGPT-small-py-adaptedGPT2
    
    ```python
    """Forward computation. Args: x: a Tensor lengths: a list of length-1 tensors train: whether to train the forward computation Returns: a Tensor """ if train: x = self.forward_train(x) return x  def __init__(self, *args,
    ```
    
-   5.incoder-6B
    
    ```python
    length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_length_
    ```
    
-   6.incoder-1B
    
    ```python
    :=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):=False):
    ```
    
-   7.codegen-350M-mono
    
    ```python
    x = self.embeddings(x)
    x = x.unsqueeze(1)
    x = [F.relu(conv(x)).squeeze(3) for conv in self.convs]
    x = [F.max_pool1d(i, i.size(2)).squeeze(2) for i in x]
    x = [F.relu(i) for i in x]
    x = [F.relu(i) for i in x]
    x = [F.max_
    ```
    
-   8.codegen-2B-mono
    
    ```python
    x = self.embeddings(x)
    x = x.permute(1, 0, 2)
    x = self.dropout(x)
    x = F.relu(x)
    x = x.permute(1, 0, 2)
    x = [F.max_pool1d(c(x), x.size(2)).squeeze(2) for c in self.convs]
    x = torch.cat(x, 1)
    x = self.dropout(x)
    x =
    ```
    
-   9.codegen-6B-mono
    
    ```python
    x = self.embeddings(x)
    x = x.transpose(1, 2)
    x = [F.relu(conv(x)).squeeze(3) for conv in self.convs]
    x = [F.max_pool1d(i, i.size(2)).squeeze(2) for i in x]
    x = torch.cat(x, 1)
    x = self.dropout(x)
    x = self.fc(x)
    return x
    ```
    
-   11.codegen-350M-multi
    
    ```python
        if train:
            return self.dropout(self.fc(x, lengths))
        else:
            return self.fc(x, lengths)
    
    def forward_batch(self, x, lengths, batch_size):
        return self.forward(x, lengths, train=True)
    
    def forward_batch_with_lengths(self, x, lengths, batch_size):
        return self.forward_batch(x, lengths, batch_size)
    
    def forward_batch_with_lengths_and_batch_size(self, x
    ```
    
-   12.codegen-2B-multi
    
    ```python
    x = self.embeddings(x)
    x = x.view(-1, x.size(0), x.size(1))
    x = F.relu(self.dropout(self.convs(x)))
    x = x.view(-1, x.size(0), x.size(1))
    x = self.fc(x)
    return x, lengths
    ```
    
-   13.codegen-6B-multi
    
    ```python
    x = self.embeddings(x)
    x = torch.cat([x, lengths], 1)
    x = self.dropout(x)
    x = torch.cat([x, x], 1)
    x = torch.cat([x, x], 1)
    x = torch.cat([x, x], 1)
    x = torch.cat([x, x], 1)
    x = torch.cat([x, x], 1)
    x = torch.cat([x, x], 1)
    x = torch.cat
    ```
    
-   16.gpt-neo-125M-code-clippy
    
    ```python
     * * * * * * * *
     * * * * * * * * * * *
     * * * * * * * * * * * *
    т
     *
     *
     *
    
     *
     *
     *
     *
     *
     *
     *
     *
     * *
     *
    ```
    
-   17.GPT2-python-code-generator
    
    ```python
    x = self.embeddings(x)
    x = self.fc(x)
    x = self.dropout(x)
    x = self.fc
    ```
    
-   18.codeparrot
    
    ```python
    x = self.embed(x)
    x = self.dropout(x)
    x = self.fc(x)
    x = self.dropout(x)
    x = self.fc(x)
    x = self.dropout(x)
    x = self.fc(x)
    ```
    
-   19.codeparrot-small
    
    ```python
    x = self.embeddings(x)
    lengths = self.dropout(lengths)
    x = self.fc(x)
    lengths = self.dropout(lengths)
    x = self.embeddings(x)
    lengths = self.dropout(lengths)
    x = self.dropout(x)
    ```
    

#### 3.2.2. Python语言代码生成测试2

-   输入原文
    
    ```python
    import numpy as np
    
    
    def softmax(x):
        """Compute softmax values for each sets of scores in x."""
    ```
    

* * *

-   1.code-autocomplete-distilgpt2-python
    
    ```python
    x = np.zeros((x.shape[0], x.shape[1]))
    x[:, :, :] = np.zeros((x.shape[0], x.shape[1]))
    x[:, :, :]
    ```
    
-   2.code-autocomplete-gpt2-base
    
    ```python
    x = np.zeros((x.shape[0], x.shape[1], x.shape[2]), dtype=np.float32)
    x[:, :, :, :] = x[:, :, :, :] * x[:, :  
    ```
    
-   3.CodeGPT-small-py-adaptedGPT2
    
    ```python
    """Compute softmax values for each sets of scores in x.""" x = np.asarray(x) # x = np.asarray(x.T) # x = np.asarray(x.T) # x = np.asarray(x.T) # x = np
    ```
    
-   5.incoder-6B
    
-   6.incoder-1B
    
    ```python
    x."""Compute softmax values for each sets of scores in x."""
    x."""Compute softmax values for each sets of scores in x."""
    x."""Compute softmax values for each sets of scores in x."""
    x."""Compute softmax values for each sets of scores in x."""
    x."""Compute
    ```
    
-   7.codegen-350M-mono
    
    ```python
    e_x = np.exp(x - np.max(x))
    return e_x / e_x.sum()
    ```
    
-   8.codegen-2B-mono
    
    ```python
    e_x = np.exp(x - np.max(x))
    return e_x / e_x.sum(axis=0)  #
    ```
    
-   9.codegen-6B-mono
    
    ```python
    e_x = np.exp(x - np.max(x))
    return e_x / e_x.sum()
    ```
    
-   11.codegen-350M-multi
    
    ```python
    return np.exp(x - np.max(x, axis=1))
    ```
    
-   12.codegen-2B-multi
    
    ```python
    e_x = np.exp(x - np.max(x))
    return e_x / e_x.sum()
    ```
    
-   13.codegen-6B-multi
    
    ```python
    #
    ```
    
-   15.gpt-neo-125M-code-search-py
    
    ```python
        if len(x) == 1:
            return np.sum(np.abs(x))
        else:
            return np.sum(np.abs(x))
    def _get_scores(self,
    ```
    
-   16.gpt-neo-125M-code-clippy
    
    ```python
    def softmax(x):
    def softmax(x):
    def softmax(x):
    def softmax(x):
    def softmax(x):
    def Softmax(x):
    def Softmax(x):
    def Softmax(x):
    def Softmax(x):
    ```
    
-   17.GPT2-python-code-generator
    
    ```python
        return np.sum(np.abs(x - np.log(x)) / np.log(x))
    
    
    def softmax_log_prob(x):
        """Compute softmax values for each sets of scores in x."""
        return
    ```
    
-   18.codeparrot
    
    ```python
    #    return np.exp(x - np.max(x, axis=1, keepdims=True))
        return np.exp(x - np.max(x, axis=1, keepdims=True))
    
    
    def softmax_cross_entropy(logits, labels):
        """Compute softmax cross entropy
    ```
    
-   19.codeparrot-small
    
    ```python
    #    x = np.asarray(x)
        x = np.asarray(x)
        x = x.reshape(-1, 1)
        x = x.reshape(-1, 1)
        x = x.reshape(-1, 1)
        x = x.reshape(-1, 1)
    ```
    

#### 3.2.3. Python语言代码生成测试3

-   输入原文

```python
from flask_jwt_extended import JWTManager
from flask_apscheduler import APScheduler
from flask import Flask
from utils import scheduler_build

jwt_app = Flask(__name__)
class SchedulerConfig(object):
    JOBS = [
        {
            "id": "scheduler_build",
            "func": scheduler_build,
            "trigger": "interval",
            "seconds": 10,
        }
    ]
    SCHEDULER_API_ENABLED = True

scheduler = APScheduler()
```

* * *

-   1.code-autocomplete-distilgpt2-python
    
    ```python
    #!/usr/bin/env python3
    
    # Copyright (c) Meta Platforms, Inc. and affiliates.
    # All rights reserved.
    #
    # This source code is licensed under the BSD-style license found in the
    # LICENSE file in the root directory of this
    ```
    
-   2.code-autocomplete-gpt2-base
    
    ```python
    
    
    
    # Copyright (c = """
    from __version__version__ = """
    from __version__
    from __version__ import __version__
    from __version__ import __version__
    from __version__ import __version__
    
    from __version__ import __version__ import __version
    ```
    
-   3.CodeGPT-small-py-adaptedGPT2
    
    ```python
    # TODO: move to the front of the list of supported schemas. # TODO: move to the front of the list of supported schemas. # TODO: move to the front of the list of supported schemas. # TODO: move to the front of the list of supported schemas.
    ```
    
-   5.incoder-6B
    
    ```python
    scheduler.add_job(
        id="scheduler_build",
        func=scheduler_build,
        trigger="interval",
        seconds=10,
    )
    scheduler.start()
    </code>
    ```
    
-   6.incoder-1B
    
-   7.codegen-350M-mono
    
    ```python
    jwt = JWTManager(jwt_app)
    scheduler.init_app(jwt_app)
    scheduler.start()
    
    @jwt.token_in_blocklist_loader
    def check_if_token_in_blocklist(jwt_header, jwt_payload):
        return jwt_payload['jti'] in scheduler.job_dict
    ```
    
-   8.codegen-2B-mono
    
    ```python
    scheduler.init_app(jwt_app)
    scheduler.configure(SchedulerConfig)
    jwt = JWTManager(jwt_app)
    
    from app import routes, models, errors
    ```
    
-   9.codegen-6B-mono
    
    ```python
    scheduler.init_app(jwt_app)
    scheduler.start()
    jwt_app.config.from_object(SchedulerConfig())
    jwt = JWTManager(jwt_app)
    ```
    
-   11.codegen-350M-multi
    
    ```python
    jwt_app.config.update(SCHEDULER_API_ENABLED=SCHEDULER_API_ENABLED)
    
    jwt_app.config.update(SECRET_KEY='secret')
    
    jwt_app.config.update(SECURITY_PASSWORD='password')
    
    jwt_app.config.update(
        JWT_MANAGER=JWTManager(jwt_app.config['SECRET_KEY'],
                               jwt_app.config['SECURITY_PASSWORD']
    ```
    
-   12.codegen-2B-multi
    
    ```python
    scheduler.init_app(jwt_app, config=SchedulerConfig)
    
    jwt_manager = JWTManager(jwt_app)
    
    @jwt_app.route('/')
    def index():
        return 'Hello World!'
    
    @jwt_app.route('/login', methods=['POST'])
    ```
    
-   13.codegen-6B-multi
    
    ```python
    jwt_manager = JWTManager(jwt_app)
    jwt_manager.init_app(jwt_app)
    jwt_manager.init_scheduler(scheduler, SchedulerConfig.JOBS)
    
    @jwt_manager.jwt_required
    def index():
        return "Hello World"
    
    if __name__ == "__main__":
        jwt_app.run(host='0.0.0.0', port=80)
    ```
    
-   15.gpt-neo-125M-code-search-py
    
    ```python
    scheduler.add_job(JWTManager(
    ```
    
-   16.gpt-neo-125M-code-clippy
    
    ```python
    
    j.�.
    class
    _apSCheduler_extended_
    _apscheduler_extended_extended_extended_extended_extended_extended_extended_extended_extended_extended_extended_extended_extended_
    ```
    
-   17.GPT2-python-code-generator
    
    ```python
    
    class Scheduler(JWTManager):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.__class__ = Scheduler
    ```
    
-   18.codeparrot
    
    ```python
    scheduler.init_app(scheduler_app)
    scheduler.add_job(
        "interval",
        seconds=10,
        id="scheduler_build",
        func=scheduler_build,
        trigger="interval",
    )
    scheduler.start()
    
    app = Flask(__name__)
    app.
    ```
    
-   19.codeparrot-small
    
    ```python
    scheduler.add_app(jwt_app)
    scheduler.add_app(SchedulerConfig())
    
    scheduler.start()
    # -*- coding: utf-8 -*-
    #
    # Copyright (C) Pootle contributors.
    #
    # This file is a part of the Pootle project.
    ```
    

#### 3.2.4.Vue.js语言代码生成测试4

-   输入原文
    
    ```markup
    <template>
      <div class="login-container">
        <el-form
          ref="loginForm"
          :model="loginForm"
          :rules="loginRules"
          class="login-form"
          auto-complete="on"
          label-position="left"
        >
          <div class="title-container">
            <h3 class="title">Scorpio</h3>
          </div>
    
          <el-form-item prop="username">
            <span class="svg-container">
              <svg-icon icon-class="user" />
            </span>
            <el-input
    ```
    

* * *

-   5.incoder-6B
    
    ```markup
        placeholder="user"
        id="user"
        />
    </el-form-item>
    
    <el-form-item prop="username">
        <span class="svg-container">
        <svg-icon icon-class="user" />
        </span>
        <el-input
        placeholder="user"
        id="user"
        />
    </
    ```
    
-   6.incoder-1B
    
    ```markup
        ref="username"
        :model="username"
        :rules="usernameRules"
        class="username-input"
        auto-complete="on"
        label-position="left"
    >
        <span class="title-container">
        <h3 class="title">Scorpio</h3>
        </span>
    ```
    
-   11.codegen-350M-multi
    
    ```markup
        ref="username"
        class="username"
        placeholder="Username"
        value="">
        <el-input-group placeholder="Username" />
    </el-input>
    </el-form-item>
    
    <el-form-item prop="password">
    <span class="svg-container">
        <svg-icon icon-class="password" />
    </span>
    <el-input
        ref="password"
        class="password"
        placeholder="Password"
        value="">
    ```
    
-   12.codegen-2B-multi
    
    ```markup
        ref="username"
        placeholder="Username"
        class="username"
        label="Username"
        auto-complete="off"
    />
    </el-form-item>
    
    <el-form-item prop="password">
    <span class="svg-container">
        <svg-icon icon-class="lock" />
    </span>
    <el-input
        ref="password"
        placeholder="Password"
        class="password"
        label="Password"
        auto-complete="off"
    ```
    
-   13.codegen-6B-multi
    
    ```markup
    ref="username"
    v-model="loginForm.username"
    placeholder="Username"
    autofocus
    :label="loginForm.username"
    :rules="loginRules"
    :error-message="loginForm.usernameError"
    :validation-error="loginForm.usernameError"
    :validation-error-message="loginForm.usernameErrorMessage"
    :validation-error-class="loginForm.usernameErrorClass"
    :validation-error-class-message="loginForm.usernameErrorMessage"
    ```
    
-   16.gpt-neo-125M-code-clippy
    
    ```markup
    �у-�.л-�у
    <div class="login-container">
    <div>
    <div class="login-container">
    <div class="login-�">
    <div class="login-�="login-container-container-container-container-
    ```
    
    #### 3.2.5.JavaScript语言代码生成测试5
    
-   输入原文
    
    ```javascript
    import { asyncRoutes, constantRoutes } from '@/router'
    
    
    function hasPermission(roles, route) {
    ```
    

* * *

-   5.incoder-6B
    
-   6.incoder-1B
    
    ```javascript
    ) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {) {
    ```
    
-   11.codegen-350M-multi
    
    ```javascript
    return roles.indexOf(route.permission) > -1
    }
    
    function getPermission(roles, route) {
      return roles.indexOf(route.permission) > -1
    }
    
    function hasRoute(roles, route) {
      return roles.indexOf(route.permission) > -1
    }
    
    function getRoute(roles, route) {
      return roles.indexOf(route.permission) > -1
    }
    
    function hasRoutePermission(roles, route, permission) {
      return
    ```
    
-   12.codegen-2B-multi
    
    ```javascript
    return roles.indexOf(route.permission) > -1
    }
    
    export default asyncRoutes(
      {
        [constantRoutes.LOGIN]: {
          path: '/login',
          component: require('./login'),
          permission: 'user',
          meta: {
            title: 'Login',
            description: 'Login to the system',
            icon: 'fa fa-sign-in'
          }
        },
        [constantRoutes.LOGOUT]: {
          path: '/logout
    ```
    
-   13.codegen-6B-multi
    
    ```javascript
      if (!roles) {
        return true
      }
      return roles.indexOf(route.meta.roles) >= 0
    }
    
    function hasPermission(roles, route, permission) {
      if (!roles) {
        return true
      }
      return roles.indexOf(route.meta.roles) >= 0 && route.meta[permission]
    }
    
    function hasPermission(roles, route, permission, permissionValue) {
      if (!roles) {
        return true
      }
      return roles
    ```
    
-   16.gpt-neo-125M-code-clippy
    
    ```javascript
    return {
    ```
    

### 3.3.亮点

1.  `codegen-6B-mono`在测试1中，完美的写出了TextCNN的网络结构

### 3.4.结论

1.  模型大真的能力会更强，参考`codegen-6B-mono`的表现
2.  [Model Hub](https://huggingface.co/models)的下载量水分很大，参考`code-autocomplete-distilgpt2-python`的表现
3.  分领域很有用，参考`codegen-6B-mono`相比`codegen-6B-multi`在Python问题上的表现
4.  [Sailesforce](https://github.com/salesforce)的[codegen](https://github.com/salesforce/CodeGen)系列，比其他开源代码生成模型好了一个档次
5.  开源代码生成模型都是围绕Python语言居多，偶尔有全栈语言

## 4.搭建私有化代码生成服务

### 4.1. onnx量化压缩

-   模型一般部署在cpu上运行，使用onnxruntime量化技术可以大幅提高模型运行提速
-   推荐使用[fastgpt](https://github.com/LowinLi/fastgpt)库对transformers的GPT模型进行onnx量化和加载
-   对于不支持`transformers`的`codegen`系列，`fastgpt`也有[codegen例子](https://github.com/LowinLi/fastgpt/tree/main/example/codegen)做onnx量化和代码生成

#### 4.1.1. fastgpt安装方法

```bash
pip install fastgpt
```

#### 4.1.2. fastgpt快速使用

```python
from transformers import AutoTokenizer
from fastgpt import CausalLMModelForOnnxGeneration
model = CausalLMModelForOnnxGeneration.from_pretrained("distilgpt2")
tokenizer = AutoTokenizer.from_pretrained("distilgpt2")

prompt_text = "Natural language processing (NLP) is the ability of a computer program to understand human language as it is spoken and written"
input_ids = tokenizer(
    prompt_text, return_tensors="pt", add_special_tokens=False
).input_ids

generated_ids = model.generate(   # 这里完全兼容transformers的generate函数
    input_ids,
    max_length=64 + input_ids.shape[1],
    decoder_start_token_id=tokenizer.cls_token_id,
    eos_token_id=tokenizer.sep_token_id,
    output_scores=True,
    temperature=1,
    repetition_penalty=1.0,
    top_k=50,
    top_p=0.9,
    do_sample=True,
    num_return_sequences=1,
    length_penalty=2.0,
    early_stopping=True,
)
print(tokenizer.decode(generated_ids[0], skip_special_tokens=True))
print("=" * 20)
```

### 4.2. 私有化web服务

-   在[fastgpt](https://github.com/LowinLi/fastgpt)仓库的[codegen例子](https://github.com/LowinLi/fastgpt/tree/main/example/codegen)中已经把`codegen-350M-mono`和`codegen-350M-multi`进行onnx量化和打包镜像，并上传了[dockerhub](https://hub.docker.com/repository/docker/lowinli98/fastgpt-codegen)

#### 4.2.1. docker-compose启动

```yaml
version: "2.3"
services:
  fastgpt-codegen:
    container_name: fastgpt-codegen
    image: lowinli98/fastgpt-codegen:v0.0.7
    expose:
      - 7104
    ports:
      - "7104:7104"
    environment:
      - PORT=7104
      - GUNICORN_WORKER=1
      - GUNICORN_THREADS=1
    restart: always
```

#### 4.2.2. 测试

**codegen-350M-mono**

```bash
curl --location --request POST 'http://172.16.104.29:7104/generate_mono' \
--header 'Content-Type: application/json' \
--data-raw '{
    "inputs": "def calculdate_mean(x, y): \n",
    "parameters": {
        "do_sample": true
    }
}'
```

**codegen-350M-multi**

```bash
curl --location --request POST 'http://172.16.104.29:7104/generate_multi' \
--header 'Content-Type: application/json' \
--data-raw '{
    "inputs": "def calculdate_mean(x, y): \n",
    "parameters": {
        "do_sample": true
    }
}'
```

## 5.制作私有化Vscode插件

-   详见适配最新vscode版本(1.68.1)的[vscode插件](https://github.com/LowinLi/code-clippy-vscode)

## 6.enjoy-coding

![](/posts-media/pan-dian-kai-yuan-copilot/_.png)

## 附录：

### 1\. 推理计算资源

-   cpu: Intel(R) Core(TM) i9-9900X CPU @ 3.50GHz

| 模型 | 硬盘占用 | torch加载使用内存 | 测试1用时 | 测试2用时 | 测试3用时 |
| --- | --- | --- | --- | --- | --- |
| codegen-16B-mono | 30G | \* | \* | \* | \* |
| codegen-6B-mono | 14G | 40G | 346s | 96s | 45s |
| codegen-2B-mono | 614M | 17G | 38s | 13s | 38s |
| codegen-350M-mono | 167M | 3G | 5s | 5s | 5s |
