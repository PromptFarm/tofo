# Personas Catalog

This directory contains AI reviewer persona definitions for use in PromptFarm evaluation specs.
Each domain file defines a complete set of personas with `id`, `title`, `weight`, and `description`.

---

## Domains

| File | Domain | Personas |
|---|---|---|
| [business-startup.md](./business-startup.md) | Business / Startup | 21 personas |
| [education.md](./education.md) | Education | 20 personas |
| [health-fitness.md](./health-fitness.md) | Health & Fitness | 22 personas |
| [gamedev.md](./gamedev.md) | Game Development | 31 personas |

---

## How to Use

Reference any persona by `id` in your prompt YAML `evaluation.reviewerRoles` block.
IDs come from the persona entries in each domain file.

### Minimal reference (resolves from registry)

```yaml
evaluation:
  reviewerRoles:
    - id: founder
    - id: vc_investor
```

### Full inline definition (custom weight / description override)

```yaml
evaluation:
  reviewerRoles:
    - id: game_director
      title: Game Director
      description: Evaluates whether all decisions serve the core creative vision.
      weight: 1.5
    - id: narrative_designer
      title: Narrative Designer
      description: Reviews story structure and ludonarrative coherence.
      weight: 1.3
```

---

## Domain Summary

### Business / Startup
Covers the full startup team: `founder`, `cto`, `cfo`, `cmo`, `product_manager`, `vp_sales`, `growth_hacker`, `vc_investor`, `angel_investor`, `biz_dev_lead`, `legal_counsel`, `hr_lead`, `operations_lead`, `customer_success_lead`, `data_analyst`, `market_researcher`, `ux_researcher`, `brand_strategist`, `pr_lead`, `startup_advisor`, `accelerator_partner`.

### Education
Covers the full learning ecosystem: `curriculum_designer`, `instructional_designer`, `subject_matter_expert`, `teacher`, `university_professor`, `tutor`, `student`, `education_researcher`, `elearning_developer`, `learning_experience_designer`, `assessment_specialist`, `special_education_advisor`, `school_principal`, `edtech_product_manager`, `parent_stakeholder`, `corporate_trainer`, `language_educator`, `stem_educator`, `literacy_specialist`, `edtech_investor`.

### Health & Fitness
Covers clinical and wellness roles: `general_practitioner`, `sports_medicine_physician`, `registered_dietitian`, `personal_trainer`, `strength_coach`, `physiotherapist`, `sports_psychologist`, `wellness_coach`, `yoga_instructor`, `endocrinologist`, `cardiologist`, `psychiatrist`, `sleep_specialist`, `orthopedic_surgeon`, `functional_medicine_practitioner`, `exercise_physiologist`, `athletic_trainer`, `health_app_ux_designer`, `public_health_specialist`, `senior_fitness_specialist`, `pediatric_health_specialist`, `registered_nurse`.

### Game Development
Covers the full game studio: `game_designer`, `lead_game_designer`, `narrative_designer`, `level_designer`, `systems_designer`, `ux_designer`, `ui_artist`, `game_programmer`, `engine_programmer`, `graphics_programmer`, `gameplay_programmer`, `tools_programmer`, `technical_artist`, `game_artist`, `3d_artist`, `animator`, `sound_designer`, `game_producer`, `executive_producer`, `qa_lead`, `game_tester`, `monetisation_designer`, `community_manager`, `game_marketer`, `platform_specialist`, `accessibility_specialist`, `game_economist`, `ai_programmer`, `network_programmer`, `indie_developer`, `game_director`.

