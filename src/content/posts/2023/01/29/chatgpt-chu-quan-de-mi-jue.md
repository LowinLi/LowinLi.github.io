---
title: "ChatGPT出圈的秘诀"
date: 2023-01-29
updated: 2023-10-06
tags: ["RLHF", "ChatGPT", "AI"]
categories: ["技术"]
description: "通篇翻译自 Rajani et al., “What Makes a Dialog Agent Useful?”, Hugging Face"
shelf: llm
oldUrl: "/2023/01/29/chatgpt-chu-quan-de-mi-jue/"
---

通篇翻译自  
[Rajani et al., “What Makes a Dialog Agent Useful?”, Hugging Face Blog, 2023.](https://huggingface.co/blog/dialog-agents)

### ChatGPT背后的技术：RLHF、IFT、CoT、Red teaming …

几周前，ChatGPT横空出世，使得热点都集中到ChatGPT背后的新技术，即一系列晦涩的缩写术语：RLHF、SFT、IFT、CoT等。这些缩写是什么，为什么如此重要？我们调查了所有关于这些主题的重要论文，将其进行分类，总结已经完成的工作，并分享仍有待挖掘的内容。

让我们从语言模型对话机器人的视角开始。事实上，ChatGPT并不是第一个语言模型对话机器人，在OpenAI之前，有许多组织发布了他们的语言模型对话机器人，包括[Meta的BlenderBot](https://arxiv.org/abs/2208.03188)、[Google的LaMDA](https://arxiv.org/abs/2201.08239)、[DeepMind的Sparrow](https://arxiv.org/abs/2209.14375)和[Anthropic的Assistant](https://arxiv.org/abs/2204.05862)（这个机器人仍处于持续开发并没有定型的版本也被称为Claude）。一些团体也宣布了他们计划建立一个开放领域对话机器人并公开分享技术方案（[LAION的Open Assistant](https://github.com/LAION-AI/Open-Assistant)）；肯定也有很多人在研究之中，尚未宣布。

以下表格根据是否可公开访问、训练数据、模型架构、评估方向等细节对比了这些AI对话机器人。ChatGPT并未公布细节，所以我们用InstructGPT来代替。因为它是OpenAI的指令微调模型，且据信是ChatGPT的底层服务。

| &nbsp; | LaMDA | BlenderBot 3 | Sparrow | ChatGPT/ InstructGPT | Assistant |
| --- | --- | --- | --- | --- | --- |
| **组织** | Google | Meta | DeepMind | OpenAI | Anthropic |
| **是否公开** | ✖️ | ✔ | ✖️ | 有限度的 | ✖️ |
| **模型参数量** | 137B | 175B | 70B | 175B | 52B |
| **预训练基础模型** | Unknown | OPT | Chinchilla | GPT-3.5 | Unknown |
| **预训练语料数量** (词数) | 2.81T | 180B | 1.4T | Unknown | 400B |
| **模型可在线访问** | ✔ | ✔ | ✔ | ✖️ | ✖️ |
| **有监督微调** | ✔ | ✔ | ✔ | ✔ | ✔ |
| **微调数据量** | Quality:6.4K  
Safety: 8K  
Groundedness: 4K  
IR: 49K | 20 NLP datasets ranging from 18K to 1.2M | Unknown | 12.7K (for InstructGPT, likely much more for ChatGPT) | 150K + LM generated data |
| **人工反馈强化学习** | ✖️ | ✖️ | ✔ | ✔ | ✔ |
| **安全性的规则** | ✔ | ✖️ | ✔ | ✖️ | ✔ |
| **评价方向** | 1\. Quality (sensibleness, specificity, interestingness)  
2\. Safety (includes bias) 3. Groundedness | 1, Quality (engagingness, use of knowledge)  
2\. Safety (toxicity, bias) | 1\. Alignment (Helpful, Harmless, Correct)  
2\. Evidence (from web)  
3\. Rule violation  
4\. Bias and stereotypes  
5\. Trustworthiness | 1\. Alignment (Helpful, Harmless, Truthfulness)  
2\. Bias | 1\. Alignment (Helpful, Harmless, Honesty)  
2\. Bias |
| **使用该模型的数据标注的众包平台** | U.S. based vendor | Amazon MTurk | Unknown | Upwork and Scale AI | Surge AI, Amazon MTurk, and Upwork |

我们观察到，尽管训练数据、模型和微调之间存在许多差异，但也存在一些共同之处。上述所有对话机器人的共同目标都是遵循用户指定的指令，例如用户指令ChatGPT写一首关于微调的诗。

![](/posts-media/chatgpt-chu-quan-de-mi-jue/chatgpt-example.png)

### 从文本预测到跟随指令

通常，以语言模型为目标的基础模型对人类指示的回复效果并不好，因此模型创建者使用了指令微调**Instruction Fine-Tuning，IFT**，其包括在一些非常不同的任务（包括情感、文本分类、摘要等经典NLP任务）上对基础模型进行微调。这些指令数据由三个主要组成部分组成：指令、输入和输出。输入是可选的，有些任务只需要诸如ChatGPT示例中的开放式生成等指令。对于给定的指令，可以有多个输入和输出实例。有关示例，请参见下面（引自 \[Wang et al。，“22“））。

![](/posts-media/chatgpt-chu-quan-de-mi-jue/ift.png)

IFT的数据通常是由人工手写指令和语言模型引导的指令实例的集合。对于引导，语言模型以少量样本示例的形式提示，并指示生成新的指令、输入和输出。在每轮中，模型提示既有人工编写的，也有模型生成的样本。人与模型在创建数据集方面所做出的贡献图如下。

![](/posts-media/chatgpt-chu-quan-de-mi-jue/ift-spectrum.png)

一端是完全由模型生成的 IFT 数据集，如**Unnatural instructions**（[Honovich et al., 22](https://arxiv.org/abs/2212.09689)），另一端则是社区大量的手工指令，如**Super-natural instructions**（[Wang et al., 22](https://arxiv.org/abs/2204.07705)）。在这两者之间的工作是使用一小组高质量的种子数据集，然后进行语言模型的自监督，如Self-instruct（[Wang et al., 22](https://arxiv.org/pdf/2212.10560.pdf)）。另一种收集IFT数据集的方法是采用现有的高质量人工智能数据集（包括Prompt提示），并使用统一的模式或多种不同模板将其转换为指令。该工作线包括**T0**（[Sanh et al., 22](https://arxiv.org/pdf/2110.08207.pdf)），**Natural instructions dataset**（[Mishra et al., 22](https://arxiv.org/pdf/2104.08773.pdf)），**FLAN LM**（[Wei et al., 22](https://arxiv.org/pdf/2109.01652.pdf)）和**OPT-IML**（[Iyer et al., 22](https://arxiv.org/pdf/2212.12017.pdf)）。

### 紧跟指令的安全做法

然而，经过指令微调的语言模型可能并不总是产生**有用**、**安全**的回复。例如模型回复避而不谈，总是给出一个无用的响应，如“对不起，我不明白”；或者对于敏感话题产生不安全的回复。为了缓解这种问题，模型开发者使用**Supervised Fine-tuning**（SFT），对高质量人工标记数据进行基础语言模型微调，以期取得有用且无害的回复。例如，参见下面从Sparrow论文（附录F）中提取的表格。

SFT和IFT密切相关。指令调优可以看作是监督微调的一个子集。在最近的文献中，SFT阶段常常用于安全话题，而不是IFT阶段已完成的指令特定话题的微调。未来，这种划分应该会发展成为更清晰的用例和方法。

![](/posts-media/chatgpt-chu-quan-de-mi-jue/rules.png)

Google的LaMDA也根据一套规则（附录A）进行了基于对话数据集的微调。这些规则通常是由模型创建者预先定义和开发的，这些规则涵盖了广泛的主题，包括暴力、歧视、虚假信息。

### 模型的微调

另一方面，OpenAI的InstructGPT，DeepMind的Sparrow和Anthropic的Constitutional AI都使用了人工标注偏好，即大名鼎鼎的\*\*reinforcement learning from human feedback (RLHF)\*\*。在RLHF中，把一组模型回复根据人类反馈（例如，选择优先于另一个的文本片段）进行排序。然后，偏好模型在这些标注回复中进行训练，以便对RL优化器返回标量奖励。最后，使用强化学习训练对话机器人来模拟偏好模型。有关RLHF的更多详细信息，请参阅先前的[博客文章](https://lowin.li/2023/01/02/ren-gong-fan-kui-de-qiang-hua-xue-xi/)。

**Chain-of-thought** (CoT) Prompting（Wei et al., 22）是一种特殊情况的指令操作，它通过在对话机器人中通过逐步推理生成输出。CoT微调模型是使用具有人类标注的步骤推理的指令数据。这就是著名的prompt [let’s think step by step](https://arxiv.org/abs/2205.11916)的起源。下面的示例来自[Chung et al., 22](https://arxiv.org/pdf/2210.11416.pdf)。橙色表示指令，粉色表示输入和输出，蓝色表示CoT推理。

![](/posts-media/chatgpt-chu-quan-de-mi-jue/cot.png)

经过CoT 微调的模型在涉及常识、算术和符号推理的任务中表现得更好，如[Chung et al., 22](https://arxiv.org/pdf/2210.11416.pdf)所示。

CoT 微调也表明对于无害性也非常有效（有时比RLHF做得更好）。而且它不会直接逃避问题，不会为敏感的提示生成“抱歉，我无法回答这个问题”，如[Bai et al., 22](https://www.anthropic.com/constitutional.pdf)所示。参见他们论文的附录D以获取更多示例。

![](/posts-media/chatgpt-chu-quan-de-mi-jue/rlhf.png)

### 综上

1.  指令微调只需要非常少量的数据（几百个程度）相比预训练数据
2.  有监督微调使用人工标注，使模型输出更加安全和有用
3.  CoT微调可以提高模型在需要逐步推理的任务上的性能，并使它们对敏感主题不那么回避。

### 对话机器人的未来

本博客总结了一些有关如何使对话机器人有用的现有工作。但仍有许多未被探索的开放式问题。我们在这里列出一些问题。

1.  RL在从人类反馈中学习中有多重要？我们能否在IFT或SFT中以更高质量的数据获得RLHF的性能？
2.  Sparrow中的SFT + RLHF与仅使用LaMDA中的SFT来提高安全性相比如何？
3.  鉴于我们拥有IFT，SFT，CoT和RLHF，需要多少预训练？有何权衡？大家应该使用什么样的基础模型（包括公开可用的和不公开可用的）？
4.  本文中提到的许多模型都经过了仔细的[红队测试](https://arxiv.org/abs/2209.07858)，其中工程师会特别搜索失败模式，并根据暴露的问题规划未来的训练（促进和方法）。我们如何系统地记录这些方法的效果并重现它们？
