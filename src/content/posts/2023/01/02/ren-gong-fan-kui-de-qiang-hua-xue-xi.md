---
title: "人工反馈的强化学习"
date: 2023-01-02
updated: 2023-10-06
tags: ["NLP", "transformers", "RLHF", "强化学习"]
categories: ["技术"]
description: "翻译自Huggingface博客"
shelf: llm
oldUrl: "/2023/01/02/ren-gong-fan-kui-de-qiang-hua-xue-xi/"
---

# 人工反馈的强化学习

-   翻译自[Huggingface博客](https://huggingface.co/blog/rlhf)

近几年，通过人工prompt提示，语言模型可以出色的生成多样的或限定的文本。但是，如何界定“好”的生成文本是很难的，因为它很主观，同时需要考虑上下文的。例如有很多应用，比如写故事，是希望生成的文本具有创造性，希望信息是真实的，或者是我们希望生成的代码片段是可以跑通的，这些都不仅仅是语言层面的问题，需要人工反馈调节。

直接写一个损失函数来捕获这些反馈似乎是不可行的，因为大多数语言模型都要通过使用简单的下一个token预测损失(例如交叉熵)来训练，它们并不容易结合起来。为了弥补损失本身的缺点，人们定义了可以更好地捕获人类偏好的指标，如BLEU或ROUGE。但是这些指标只是用简单的规则将生成的文本与参考文献进行比较，适合做性能测量，并不适合作为损失函数。如果我们使用人类对生成文本的反馈作为表现的度量，或者更进一步使用该反馈作为优化模型的损失，那该有多好？这就是来自人类反馈的强化学习(RLHF)的思想：使用强化学习的方法，直接通过人类反馈来优化语言模型。RLHF帮助语言模型结合了文本数据集上的训练和复杂的人类价值观反馈。

RLHF最近的成功是它在[ChatGPT](https://openai.com/blog/chatgpt/)中的应用。鉴于ChatGPT的强大能力，我们要求它为我们解释RLHF:

![](/posts-media/ren-gong-fan-kui-de-qiang-hua-xue-xi/chatgpt-explain.webp)

解释的很好，但是还不够，接下来我们继续介绍。

## 逐步解释RLHF:

基于人类反馈的强化学习(也称为RL from human preferences)是一个具有挑战性的概念，因为它涉及多模型训练过程和不同阶段的部署。在本博客文章中，我们将训练过程分解为三个核心步骤:

1.预训练初始语言模型(LM)  
2.收集数据和训练奖励模型  
3.使用强化学习微调LM

首先，我们需要来看看语言模型的预训练

#### 预训练语言模型

RLHF需要先使用了一个已经用经典预训练目标([博客介绍](https://huggingface.co/blog/how-to-train))进行预训练的初始语言模型。OpenAI为其第一个流行的RLHF模型[InstructGPT](https://openai.com/blog/instruction-following/)使用了较小版本的GPT-3。Anthropic使用了从1000万到520亿参数训练模型。DeepMind使用了他们的280亿参数模型[Gopher](https://arxiv.org/abs/2112.11446)。

初始语言模型可以对附加文本或条件进行微调，但也不是必须的。例如，OpenAI对人工打正向标签的人工生成文本进行了微调，而Anthropic通过蒸馏原始LM认为有用的提示或有害的提示的来为RLHF生成其初始LM。这些都被认为是高成本的增强数据的来源，但不是理解RLHF所必需的。

总体来说，关于“哪种模型”是RLHF起点的最佳模型，没有明确的答案。这将是本博客的常见主题 - RLHF的设计尚有很大空间值得探索。

接下来，需要使用初始语言模型生成数据训练奖励模型，以便将人类偏好整合到系统中。

![](/posts-media/ren-gong-fan-kui-de-qiang-hua-xue-xi/pretraining.png)

#### 奖励模型训练

做一个人类偏好的奖励模型（RM，也称为人工偏好模型）是RLHF相对较新的研究方向。其基本目标是构建一个模型或系统，能够通过接受一个文本序列，返回一个反应人类偏好的标量奖励。该系统可以是端到端的语言模型，也可以是输出奖励的模块化系统（例如，模型排序输出，并将排序转换为奖励）。对于后面的RLHF过程中的无缝集成，输出的标量奖励是至关重要的。

这些用于奖励建模的LM既可以是另一个微调LM，也可以是在偏好数据上从头开始训练的LM。例如，Anthropic使用专门的微调方法来初始化这些模型（偏好模型预训练，PMP），因为他们发现它比微调更加适合样本。但其实如今，哪种奖励建模方式最优，也没有公认的最佳答案。

RM的prompt-generation训练数据集，是通过从预定义的数据集中采样得到的（Anthropic主要使用亚马逊聊天工具上生成的[数据](https://huggingface.co/datasets/Anthropic/hh-rlhf)，OpenAI使用用户在GPT API上提交的Prompt）。将Prompt传递给初始语言模型以生成新文本。

下面使用人类偏好标注来对LM生成的文本输出进行排名。我们最初可能会认为，我们应该直接对每个生成的文本，打出标量分数，来喂给奖励模型，但这在实践中很难。因为标注者个体差异，会导致标注的这些分数无法规范统一。相反，对多个模型的输出进行比较和排名，就可以创建一个更规范的数据集。

排名有多种方法。一种较成熟的方法，是让用户比较同一个prompt但是两种不同语言下，模型生成的文本。通过将模型输出进行一一比较，可以使用[Elo](https://en.wikipedia.org/wiki/Elo_rating_system)系统对模型和其相对于输出进行比较排名。这些排名方法都可以标准化标量奖励得分，从而使其适合做奖励训练。

如今，RLHF系统是一个有趣的奖励训练流程。

这个过程有个有趣的现象，即迄今为止成功的RLHF系统都使用了与文本生成相对应大小的奖励语言模型（例如OpenAI 175B LM模型，6B 奖励模型，Anthropic使用了从10B到52B的LM模型 和 奖励模型，DeepMind使用了70B Chinchilla 模型来作LM模型和 奖励模型）。直觉上，这些偏好模型需要具有与生成该文本所需的模型相同的理解能力。

此时，我们在RLHF系统上准备好了，一个可用于生成文本的初始语言模型和一个接受任何文本并将其转换成人类偏好标量得分的奖励模型。接下来，我们使用强化学习（RL）来优化基于奖励模型的原始语言模型。我们使用RL，通过奖励模型，来优化初始语言模型

![](/posts-media/ren-gong-fan-kui-de-qiang-hua-xue-xi/reward-model.webp)

#### RL微调

用强化学习训练语言模型一直以来，无论算法层还是工程层，都被认为是不可能实现的事情。而多个组织如今似乎做到了这一点，他们使用一种名为近端策略优化（PPO）的策略梯度强化学习算法微调了原始语言模型（LM）的一些或者全部参数。由于微调一个具有10B或100B +参数的整个模型开销太大，因此部分参数被冻结（例如微软的[LoRA](https://arxiv.org/abs/2106.09685)或DeepMind的[Sparrow LM](https://arxiv.org/abs/2209.14375)）。PPO已经存在相对较长的时间了，有很多关于它的[教程](https://huggingface.co/blog/deep-rl-ppo)。这种方法相对成熟，并使其成为扩展到新的分布式强化学习高级模型（RLHF）应用的一个有利选择。事实证明，进行RLHF的核心是找出如何用一个熟悉的算法更新这么大的模型（关于这一点稍后再说）。

首先，我们将微调任务制定为RL问题。该**策略**是一个语言模型，输入一个提示并返回一个文本序列（或返回文本序列上的概率分布）。该策略返回的**操作范围**是文本序列上每个token在语言模型的词汇量（通常为50k个令牌）的概率分布，因为语言模型的词汇量往往很大，所以改策略返回的反问也相当大。**奖励函数**就是奖励偏好模型与策略转移约束的结合。

奖励函数是要系统的将我们讨论过的所有模型合并成一个RLHF过程。给定数据集中的一个prompt $x$和来自初始语言模型和当前迭代的微调策略生成的两个文本$y_1$，$y_2$。当前文本给到偏好模型，得到代表人是否偏好的标量得分$r_{\theta}$。这个文本与来自初始模型的文本相比较，以计算它们之间的差异的惩罚。 在OpenAI，Anthropic和DeepMind的多篇论文中，此惩罚被设计为序列每个token概率分布的[Kullback–Leibler（KL）散度](https://en.wikipedia.org/wiki/Kullback%E2%80%93Leibler_divergence)的缩放版本 $r_{KL}$​。 从初始预训练模型开始，在每个训练批次上，计算KL散度惩罚，这可以帮助模型输出文本保持合理。 没有这个惩罚，优化会导致从开始生成就导致欺骗奖励模型给出高奖励的乱码文本。实践中，KL散度通过从两个分布中采样（John Schulman在这里[解释](http://joschu.net/blog/kl-approx.html)）逼近。RL更新规则收到的最终奖励是$r=r_θ−\lambda r_{KL}$​。

一些RLHF系统已经向奖励函数中添加了其他内容。例如，OpenAI在InstructGPT上成功进行试验，将额外的预训练梯度（来自人类注释）混合到PPO的更新规则中。随着RLHF的进一步研究，这个奖励函数的公式可能会继续优化。

最后，更新规则是仅考虑当前批次的PPO参数更新，最大程度地提高当前数据批次中的奖励。PPO是一种信任域优化算法，它利用梯度的约束来确保更新步骤不会破坏学习过程。DeepMind在Gopher中也使用了类似的奖励设置，但使用了[Asynchronous Advantage Actor-Critic(A2C)](http://proceedings.mlr.press/v48/mniha16.html?ref=https://githubhelp.com)来优化梯度，这显然是不同的，但尚未在外部复现。

![](/posts-media/ren-gong-fan-kui-de-qiang-hua-xue-xi/rlhf.webp)

可选的，RLHF可以在这基础上，继续迭代更新奖励模型和策略。随着RL策略的更新，用户可以继续将这些输出与之前的模型版本输出进行排名。因为需要收集此类数据的部署模式仅适用于具有访问参与用户群体的对话系统，所以大多数文章都尚未开始讨论实现这种操作。Anthropic在原始论文中讨论了这个选项，即迭代在线[$RLHF$](https://arxiv.org/abs/2204.05862)，其中迭代策略被包含在ELO排名系统的模型中。这引入了策略和奖励模型演化的动态复杂性，这也是另一个尚未定论的开放研究问题。

## RLHF的开源工具

2019年，OpenAI用TensorFlow，最早的发布了[代码](https://github.com/openai/lm-human-preferences)实现了在语言模型上执行RLHF。

如今，已经有很多基于该项目的用Pytorch实现RLHF的活跃项目。最主要的几个项目是[Transformers Reinforcement Learning (TRL)](https://github.com/lvwerra/trl)，以及[TRLX](https://github.com/CarperAI/trlx)出自TRL，实现了语言模型的强化学习（[RL4LMs](https://github.com/allenai/RL4LMs)）。

TRL的设计是为了通过PPO微调Hugging Face社区的预训练模型，TRLX是由[CarperAI](https://carper.ai/)基于TRL的复刻版本，面向更大的语言模型的，同时支持线上训练和线下训练。目前，TRLX提供了使用PPO和隐式语言Q学习[ILQL](https://sea-snell.github.io/ILQL_site/)的LLM部署（例如33B个参数），以及生产级RLHF的API。TRLX的未来版本将允许语言模型最大可达200B个参数。因此，与TRLX的接口优化，也主要在针对在此规模下具有经验的机器学习工程师。

[RL4LMs](https://github.com/allenai/RL4LMs)提供了用于调整和评估LLMs的构建模块，它包含了广泛的RL算法（PPO，NLPO，A2C和TRPO），奖励函数和指标。此外，该库易于定制，可在任意编码器解码器模型或基于编码器的语言模型上，指定用户定制的奖励函数。值得注意的是，它[最近](https://arxiv.org/abs/2210.01241)已经在2000个实验中，用于广泛任务的测试和基准，突出强调了关于数据预算比较，以及多种奖励函数trick和训练不稳定等方面的几个实用例子。RL4LMs当前的计划包括分布式训练更大的模型和新的RL算法。

TRLX和RL4LMs正在进一步快速迭代开发，因此预计不久将提供更多功能。Hub上有一个由Anthropic创建的[大型数据集](https://huggingface.co/datasets/Anthropic/hh-rlhf)。

## RLHF的未来

这些技术很有前景，很多大型AI实验室都在关注，但仍有明显局限性。这些模型虽然更好，但仍可能在没有任何不确定性的情况下，输出有害或事实错误的文本。这种不完善性带来了RLHF的长期挑战和动力——AI在处理人类内在问题领域，意味着永远不会有一条明确的意味完整的终止线。

在使用RLHF部署系统时，由于人力成本，收集人类偏好标注数据成本很高。RLHF的表现又高度依赖标注质量。这里的标注有两种：人类标注文本，如InstructGPT中的最初LM的微调，以及在模型输出之间打上人类偏好标签。

直接获取人手写的prompt的回复是成本很高的，这需要雇佣临时员工（不是依靠产品用户或众包），幸运的是，用于训练大多数RLHF应用程序的奖励模型的数据规模（约50k标记偏好样本）并不需要特别多，但是，它仍然比学术实验室能承受的成本要高。目前，只有一个大规模的数据集可用于RLHF的通用语言模型（来自[Anthropic](https://huggingface.co/datasets/Anthropic/hh-rlhf)）和几个较小规模的特定任务数据集（例如来自[OpenAI](https://github.com/openai/summarize-from-feedback)的摘要数据）。RLHF数据的第二个挑战是，人类注释者经常会有分歧，给训练数据增加了潜在的不确定性和可信性。

通过克服这些限制，仍可以发现大量未开发的设计选项，能帮助RLHF取得实质性进展。其中许多属于改进RL优化器的领域。PPO是一种相对较旧的算法，但没有足够的理由，其他算法能提供现有RLHF工作流程的更好的优势和变体。微调LM策略的反馈部分的一个成本大头是，需要在奖励模型上评估策略生成的每个文本片段（因为它在标准RL框架中充当环境的一部分）。为了避免这些大模型的前向传播的成本，可以使用离线RL作为策略优化器。最近，关于它的新算法已经出现，例如隐式语言Q学习（ILQL）\[CarperAI上的ILQL[讨论](https://youtu.be/fGq4np3brbs)\]，就非常适合这种优化。RL过程中的其他成本，如exploration-exploitation balance，也尚未形成文档。探索这些方向至少会发展出对RLHF功能的更充分理解，如果不是，就是性能改善。

#### 进一步阅读

以下是关于RLHF的最新论文。这个领域是从DeepRL(约2017)开始流行的，现在已经有很多AI公司发展出很多关于大语言模型的应用。下面是一些RLHF的最新焦点论文。

-   [TAMER: Training an Agent Manually via Evaluative Reinforcement](https://www.cs.utexas.edu/~pstone/Papers/bib2html-links/ICDL08-knox.pdf) (Knox and Stone 2008): Proposed a learned agent where humans provided scores on the actions taken iteratively to learn a reward model.
-   [Interactive Learning from Policy-Dependent Human Feedback](http://proceedings.mlr.press/v70/macglashan17a/macglashan17a.pdf) (MacGlashan et al. 2017): Proposed an actor-critic algorithm, COACH, where human feedback (both positive and negative) is used to tune the advantage function.
-   [Deep Reinforcement Learning from Human Preferences](https://proceedings.neurips.cc/paper/2017/hash/d5e2c0adad503c91f91df240d0cd4e49-Abstract.html) (Christiano et al. 2017): RLHF applied on preferences between Atari trajectories.
-   [Deep TAMER: Interactive Agent Shaping in High-Dimensional State Spaces](https://ojs.aaai.org/index.php/AAAI/article/view/11485) (Warnell et al. 2018): Extends the TAMER framework where a deep neural network is used to model the reward prediction.

下面是语言模型强化学习的发展简介：

-   [Fine-Tuning Language Models from Human Preferences](https://arxiv.org/abs/1909.08593) (Zieglar et al. 2019): An early paper that studies the impact of reward learning on four specific tasks.
-   [Learning to summarize with human feedback](https://proceedings.neurips.cc/paper/2020/hash/1f89885d556929e98d3ef9b86448f951-Abstract.html) (Stiennon et al., 2020): RLHF applied to the task of summarizing text. Also, Recursively Summarizing Books with Human Feedback (OpenAI Alignment Team 2021), follow on work summarizing books.
-   [WebGPT: Browser-assisted question-answering with human feedback](https://arxiv.org/abs/2112.09332) (OpenAI, 2021): Using RLHF to train an agent to navigate the web.
-   [InstructGPT: Training language models to follow instructions with human feedback](https://arxiv.org/abs/2203.02155) (OpenAI Alignment Team 2022): RLHF applied to a general language model \[Blog post on InstructGPT\].
-   [GopherCite: Teaching language models to support answers with verified quotes](https://www.deepmind.com/publications/gophercite-teaching-language-models-to-support-answers-with-verified-quotes) (Menick et al. 2022): Train a LM with RLHF to return answers with specific citations.
-   [Sparrow: Improving alignment of dialogue agents via targeted human judgements](https://arxiv.org/abs/2209.14375) (Glaese et al. 2022): Fine-tuning a dialogue agent with RLHF
-   [ChatGPT: Optimizing Language Models for Dialogue](https://openai.com/blog/chatgpt/) (OpenAI 2022): Training a LM with RLHF for suitable use as an all-purpose chat bot.
-   [Scaling Laws for Reward Model Overoptimization](https://arxiv.org/abs/2210.10760) (Gao et al. 2022): studies the scaling properties of the learned preference model in RLHF.
-   [Training a Helpful and Harmless Assistant with Reinforcement Learning from Human Feedback](https://arxiv.org/abs/2204.05862) (Anthropic, 2022): A detailed documentation of training a LM assistant with RLHF.
-   [Red Teaming Language Models to Reduce Harms: Methods, Scaling Behaviors, and Lessons Learned](https://arxiv.org/abs/2209.07858) (Ganguli et al. 2022): A detailed documentation of efforts to “discover, measure, and attempt to reduce \[language models\] potentially harmful outputs.”
-   [Dynamic Planning in Open-Ended Dialogue using Reinforcement Learning](https://arxiv.org/abs/2208.02294) (Cohen at al. 2022): Using RL to enhance the conversational skill of an open-ended dialogue agent.
-   [Is Reinforcement Learning (Not) for Natural Language Processing?: Benchmarks, Baselines, and Building Blocks for Natural Language Policy Optimization](https://arxiv.org/abs/2210.01241) (Ramamurthy and Ammanabrolu et al. 2022): Discusses the design space of open-source tools in RLHF and proposes a new algorithm NLPO (Natural Language Policy Optimization) as an alternative to PPO.
