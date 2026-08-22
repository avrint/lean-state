Feature: Lean State

  Scenario: Store and retrieve a value
    Given leanState is available
    When I set "name" to "Batista"
    Then getting "name" should return "Batista"
