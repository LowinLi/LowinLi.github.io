---
title: "Constrained Beam Search"
date: 2022-07-03
updated: 2022-07-04
tags: ["transformers", "nlp", "beam search", "text generation"]
categories: ["技术"]
description: "使用Transformers做限制集束搜索（Constrained Beam Search）的文本生成"
shelf: llm
oldUrl: "/2022/07/03/shi-yong-transformers-zuo-xian-zhi-ji-shu-sou-suo-constrained-beam-search-de-wen-ben-sheng-cheng/"
---

# 使用Transformers做限制集束搜索（Constrained Beam Search）的文本生成

-   翻译自[Guiding Text Generation with Constrained Beam Search in 🤗 Transformers](https://huggingface.co/blog/constrained-beam-search)

## 简介

开始前，我们需要先熟悉beam search技术，详见[How to generate text: using different decoding methods for language generation with Transformers](https://huggingface.co/blog/how-to-generate)，或[中文翻译版](https://lowin.li/2021/11/08/transformers-cang-ku-zuo-yu-yan-sheng-cheng-de-jie-ma-fang-fa-jie-shao/)

不像一般的beam search，**constrained** beam search可以对生成文本施加控制，因为很多时候，我们是明确知道生成文本之中是应该包含哪些内容的。例如在神经网络机器翻译任务中，通过查词典，我们明确知道生成文本应该包含的专业词汇。有时，生成的结果是满足语言模型的要求，但只是因为未包含部分关键信息，就不能够满足用户的需求。这些场景都需要让用户告诉模型，哪些词汇必须被包含在生成的内容之中。

## 难点在哪

然而，做到这个并不简单。因为这个任务需要我们在最终生成结果中的某个位置强制生成子内容。  
比如，我们需要生成一个句子$S$，必须包含内容$p_1={t_1, t_2}$，$t_1$和$t_2$是按顺序排列的。我们定义想要的句子$S$如下：$$S_{expected}={s_1,s_2,…,s_k,t_1,t_2,s_{k+1},…,s_n}$$难点在于beam search是在token粒度生成句子，我们可以把beam search简化为一个函数（虽然不完全准确）$$B(s_{0:i})=s_{i+1}$$，也就是说，输入从位置$0$至$i$的token，预测位置$i+1$的token。但是这个函数是如何知道，在位置$i<k$时，强制生成的token是要等到将来生成；在位置$i=k$时，强制生成的token是要在当前生成而不是等到$i>k$时呢。  
![](/posts-media/shi-yong-transformers-zuo-xian-zhi-ji-shu-sou-suo-constrained-beam-search-de-wen-ben-sheng-cheng/pic1.png)

如果需要多个不同的限制呢？如果想要强制包含子内容$p_1={t_1,t_2}$同时也要包含子内容$p_2={t_3,t_4,t_5,t_6}$呢？如果想要模型在这两个子内容之间做选择呢？如果想要强制生成子内容$p_1$同时需要强制从${p_{21},p_{22},p_{23}}$中选出一个子内容生成呢？

以上例子是非常合理的用户需求，下面我们通过**constrained beam search**来实现它们。

在这篇博客中，我们首先快速介绍**constrained beam search**能做什么，然后深入介绍实现的底层细节。

## 例子1. 强制词(Forcing a Word)

当我们翻译`How old are you?`到德文时，非正式场景可以说`Wie alt bist du?`，正式场景可以说`Wie alt sind Sie?`。这需要依赖上下文，与上下文保持一致，我们如何告诉模型这样做呢。

#### 传统集束搜索（Traditional Beam Search）

下面是如何使用传统的beam search来做文本翻译。

```bash
pip install -q git+https://github.com/huggingface/transformers.git
```

```python
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

tokenizer = AutoTokenizer.from_pretrained("t5-base")
model = AutoModelForSeq2SeqLM.from_pretrained("t5-base")

encoder_input_str = "translate English to German: How old are you?"

input_ids = tokenizer(encoder_input_str, return_tensors="pt").input_ids

outputs = model.generate(
    input_ids,
    num_beams=10,
    num_return_sequences=1,
    no_repeat_ngram_size=1,
    remove_invalid_values=True,
)

print("Output:\n" + 100 * '-')
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

```bash
Output:
----------------------------------------------------------------------------------------------------
Wie alt bist du?
```

#### 限制集束搜索（Constrained Beam Search）

但是如果我们想要正式表达而不是非正式呢，如果我们已经有先验知识，知道生成结果必须包含的子内容呢。  
下面是我们通过配置强制生成词`force_words_ids`来实现控制模型生成结果

```python
tokenizer = AutoTokenizer.from_pretrained("t5-base")
model = AutoModelForSeq2SeqLM.from_pretrained("t5-base")

encoder_input_str = "translate English to German: How old are you?"

force_words = ["Sie"]

input_ids = tokenizer(encoder_input_str, return_tensors="pt").input_ids
force_words_ids = tokenizer(force_words, add_special_tokens=False).input_ids

outputs = model.generate(
    input_ids,
    force_words_ids=force_words_ids,
    num_beams=5,
    num_return_sequences=1,
    no_repeat_ngram_size=1,
    remove_invalid_values=True,
)

print("Output:\n" + 100 * '-')
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

```
Output:
----------------------------------------------------------------------------------------------------
Wie alt sind Sie?
```

就像我们看到的，我们可以通过我们想要生成的先验知识，指导模型的生成结果。  
以前我们经常的做法是通过生成很多输出结果，然后筛选符合我们要求的。下面我们会在生成阶段来实现它。

## 例子2: 分离约束(Disjunctive Constraints)

上面我们介绍的场景是我们明确知道必须要生成的token，例如神经网络机器翻译任务。

但是如果我们不知道token的语法形式呢，比如输出`["raining", "rained", "rains",...]`中的任何一个都可以呢。更进一步，我们经常不想要精确到一个字母都不差的词来作为强制输出子内容。

允许这样配置约束的方法叫做分离约束(Disjunctive Constraints)。用户可以输入一组token，只要最终生成结果包含它们之中至少一个就可以。

下面是包含上面介绍的两种限制的例子：

```python
from transformers import GPT2LMHeadModel, GPT2Tokenizer

model = GPT2LMHeadModel.from_pretrained("gpt2")
tokenizer = GPT2Tokenizer.from_pretrained("gpt2")

force_word = "scared"
force_flexible = ["scream", "screams", "screaming", "screamed"]

force_words_ids = [
    tokenizer([force_word], add_prefix_space=True, add_special_tokens=False).input_ids,
    tokenizer(force_flexible, add_prefix_space=True, add_special_tokens=False).input_ids,
]

starting_text = ["The soldiers", "The child"]

input_ids = tokenizer(starting_text, return_tensors="pt").input_ids

outputs = model.generate(
    input_ids,
    force_words_ids=force_words_ids,
    num_beams=10,
    num_return_sequences=1,
    no_repeat_ngram_size=1,
    remove_invalid_values=True,
)

print("Output:\n" + 100 * '-')
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
print(tokenizer.decode(outputs[1], skip_special_tokens=True))
```

```
Setting `pad_token_id` to `eos_token_id`:50256 for open-end generation.

Output:
----------------------------------------------------------------------------------------------------
The soldiers, who were all scared and screaming at each other as they tried to get out of the
The child was taken to a local hospital where she screamed and scared for her life, police said.
```

可以看到，生成的第一句使用了`screaming`，生成的第二句使用了`screamed`，同时也都使用了`scared`。

## 传统集束搜索（Traditional Beam Search）

下面是一个传统集束搜索的例子，来自之前的[博客](https://huggingface.co/blog/how-to-generate#greedy-search)，或[中文版](https://lowin.li/2021/11/08/transformers-cang-ku-zuo-yu-yan-sheng-cheng-de-jie-ma-fang-fa-jie-shao/#Greedy-Search)  
![](/posts-media/shi-yong-transformers-zuo-xian-zhi-ji-shu-sou-suo-constrained-beam-search-de-wen-ben-sheng-cheng/pic2.png)

与贪心搜索（greedy search）不同，集束搜索保留了更长的假设序列。在上面的图片中，我们在文本生成的每一步，展示了三个下一个token的可以取值。

`num_beams=3`的集束搜索的第一步的另一种展示方式如下：  
![](/posts-media/shi-yong-transformers-zuo-xian-zhi-ji-shu-sou-suo-constrained-beam-search-de-wen-ben-sheng-cheng/pic3.png)

贪心搜索会直接选择生成`The dog`，而集束搜索会允许进一步考虑`The nice`和`The car`。

在集束搜索的下一步，我们可以考虑刚才的三条分支每个分支接下来可能的词。  
![](/posts-media/shi-yong-transformers-zuo-xian-zhi-ji-shu-sou-suo-constrained-beam-search-de-wen-ben-sheng-cheng/pic4.webp)

相比较贪心搜索，虽然我们要计算更多的输出可能性分支，但是在每步结束时仍会降至`num_beams`。我们不能配置`num_beams`太大，因为对于n步的生成，我们要计算${beams}^n$个分支。随着`num_beams`变大，分支数会快速变大，例如`num_beams=10`计算10步，就意味着`10,000,000,000`个分支。

在生成过程中，我们重复以上过程直到遇到结束条件，例如生成了`<eos>`，或者生成token数到达上线。在计算的每一步都会经历，列出所有生成分支、排序、减少分支至num\_beams、重复计算。

## 限制集束搜索（Constrained Beam Search）

限制集束搜索尝试在生成的每一步加入想要的token。

例如我们在生成结果中，强制生成短语`"is fast"`。

在传统集束搜索中，我们会在每一个分支的下一个token计算中，选取`top k`个概率最高的下一个token，然后把它们都加入至考虑范围。在限制集束搜索中，我们仍然会这样做，不过我们也会加入我们的强制生成token。  
![](/posts-media/shi-yong-transformers-zuo-xian-zhi-ji-shu-sou-suo-constrained-beam-search-de-wen-ben-sheng-cheng/pic5.png)

根据模型计算下一个词最高的概率是`dog`和`nice`，同时我们也把强制生成token`is`也放入考虑分支中，从而尽可能生成我们想要的短语`is fast`。

在下一步中，去除候选分支的策略与传统集束搜索相似，但和第一步一样，限制集束搜索会在每个分支上，再次加入强制生成token。

![](/posts-media/shi-yong-transformers-zuo-xian-zhi-ji-shu-sou-suo-constrained-beam-search-de-wen-ben-sheng-cheng/pic6.webp)

### Banks

在讨论下一步前，我们需要考虑上面步骤中不想要的结果。  
在强制生成想要的短语`is fast`时，大多时候，我们得到的是不符合逻辑的输出，例如`The is fast`。这实际上是一个较复杂问题。在[huggingface/transformers](https://github.com/huggingface/transformers)的[request issue](https://github.com/huggingface/transformers/issues/14081#issuecomment-1004479944)中有深入讨论这个问题的复杂性。

**Banks**通过平衡强制限制生成和模型概率生成，解决上面的问题。

Bank $n$ 表示**在分支中已经有了$n$个token满足了强制限制**。在通过概率排序所有分支后，我们做轮序调度选择（round-robin selection）。在以上的例子中，我们从Bank 2中选择概率最高的一个输出分支；然后从Bank 1中选择概率最高的一个输出分支；从Bank 0中选择概率最高的一个输出分支。接下来从Bank 2中选择概率第二高的分支、Bank 1中概率第二高的分支、Bank 0中概率第二高的分支，以此类推。因为我们配置的`num_beams=3`，我们只保留三个分支，所以留下了`["The is fast", "The dog is", "The dog and"]`，分别对应概率最高的Bank 2、Bank 1、 Bank 0。

通过这种方法，虽然我们强制模型考虑我们想要加入的token的分支，但是我们仍然保持了高概率的输出序列分支，从而使得输出结果更有意义。尽管`"The is fast"`完全满足我们的强制限制，但它是不符合常识的短语。幸运的是，我们还有`"The dog is"`、`"The dog and"`分支可以在后面的步骤中继续计算，它们很有希望会输出更符合常识的结果，进而在BANK 2的排序中替换掉`"The is fast"`。

步骤三的例子如下图所示：

![](/posts-media/shi-yong-transformers-zuo-xian-zhi-ji-shu-sou-suo-constrained-beam-search-de-wen-ben-sheng-cheng/pic7.webp)

注意，`"The is fast"`分支的下一个token预测，不再需要加入强制限制token了，因为强制限制token已经完全满足了。同时注意分支如`"The dog is slow"`或`"The dog is mad"`，它们虽然包含了限制词`"is"`，但是在`"is"`后面加入了`"slow"`。因此只能重新开始生成`"is fast"`，所以它们从Bank 1回到了Bank 0。

最终，在Bank 2上我们得到了`"The dog is fast"`，即满足了强制限制的短语，又满足较高的输出概率，即符合常识。

我们刚才担心的，为了强制限制token导致不符合常识语义的短语`"The is fast"`已经在轮序调度选择（round-robin selection）中被排除掉了，因为它只在Bank 2中排到最后一名，如上图所示。

## 关于Constraint Classes、Custom Constraints的更多信息

主要流程简要如下。在每一步，我们要求模型考虑满足限制token的分支，同时也要考虑那些不满足限制，有着高概率的分支，直到找到即高概率又满足限制短语的分支。

尽管在`model.generate()`函数中我们有了`force_words_ids`来控制强制生成，但我们可以做一个更好的实施设计。我们把每个限制设计成一个限制对象，它们在集束搜索过程中，分别记录下一个限制生成的token，如下所示：

```python
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM, PhrasalConstraint

tokenizer = AutoTokenizer.from_pretrained("t5-base")
model = AutoModelForSeq2SeqLM.from_pretrained("t5-base")

encoder_input_str = "translate English to German: How old are you?"

constraints = [
    PhrasalConstraint(
        tokenizer("Sie", add_special_tokens=False).input_ids
    )
]

input_ids = tokenizer(encoder_input_str, return_tensors="pt").input_ids

outputs = model.generate(
    input_ids,
    constraints=constraints,
    num_beams=10,
    num_return_sequences=1,
    no_repeat_ngram_size=1,
    remove_invalid_values=True,
)

print("Output:\n" + 100 * '-')
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

```
Output:
----------------------------------------------------------------------------------------------------
Wie alt sind Sie?
```

你可以自己定义一个限制类，放入限制列表中，从而设计自己的定制限制。只需要自己创建满足接口需要的限制子类即可。可以从[这里](https://github.com/huggingface/transformers/blob/main/src/transformers/generation_beam_constraints.py)获得更多关于限制的定义信息。

关于定制限制，有一些独特的想法（还未实现，也许你可以试试），例如`OrderedConstraints`, `TemplateConstraints`，也许将来可以加进来。当前的限制类只是为了满足生成结果包含子内容，它在生成结果的位置没有关系。例如，一个刚才的例子是`scared`后面接`screaming`，另一个是`screamed`后面接`scared`。`OrderedConstraints`可以允许用户指定这些顺序限制。

`TemplateConstraints`可以允许用户输入更多特征，例如：

```python
starting_text = "The woman"
template = ["the", "", "School of", "", "in"]

possible_outputs == [
   "The woman attended the Ross School of Business in Michigan.",
   "The woman was the administrator for the Harvard School of Business in MA."
]
```

或者：

```python
starting_text = "The woman"
template = ["the", "", "", "University", "", "in"]

possible_outputs == [
   "The woman attended the Carnegie Mellon University in Pittsburgh.",
]
impossible_outputs == [
  "The woman attended the Harvard University in MA."
]
```

或者用户不关心两个token之间有几个token，只是使用OrderedConstraint。

## 总结

限制集束搜索（Constrained beam search）可以让用户优雅的引入外部知识做文本生成。早先，是很难控制模型依照这样的限制规则的。

1.  限制生成结果必须包含短语
2.  一些短语是有可选列表，一些是不可选的
3.  短语生成在指定的位置的

现在我们通过多个限制对象（Constraint objects）的子类可以充分控制文本生成效果。  
这些新功能来自一些论文：

-   [Guided Open Vocabulary Image Captioning with Constrained Beam Search](https://arxiv.org/pdf/1612.00576.pdf)
-   [Fast Lexically Constrained Decoding with Dynamic Beam Allocation for Neural Machine Translation](https://arxiv.org/abs/1804.06609)
-   [Improved Lexically Constrained Decoding for Translation and Monolingual Rewriting](https://aclanthology.org/N19-1090/)
-   [Guided Generation of Cause and Effect](https://arxiv.org/pdf/2107.09846.pdf)

就像刚才介绍的，有很多研究论文正在探索引用外部知识（如知识库、知识图谱）辅助指导深度神经网络大模型输出结果，而限制集束搜索会是另一种有效的实现目标的方法。

感谢各位指导，Patrick von Platen对[问题提出(initial issue)](https://github.com/huggingface/transformers/issues/14081)和[最终代码合入(final PR)](https://github.com/huggingface/transformers/pull/15761)的帮助。Narsil Patry的代码反馈。  
感谢博客图片的帮助[Shorthand icons created by Freepik - Flaticon](https://www.flaticon.com/free-icons/shorthand)
